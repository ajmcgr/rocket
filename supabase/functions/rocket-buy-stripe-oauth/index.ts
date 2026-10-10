import Stripe from "npm:stripe@16.12.0";
import { APP_URL, SUPABASE_URL, base64url, getAdmin, getRocketUser, json, sha256 } from "../_shared/rocketConnect.ts";

// This is the main Rocket Connect platform's public OAuth client ID, not the
// separate read-only Stripe App used for revenue verification.
const OAUTH_CLIENT_ID = "ca_VKsWsgqb1XuSNoi4CmoAZdl3UKLoFN0n";
const PLATFORM_ACCOUNT_ID = "acct_1TfvwfL9pkHWyRRu";
const REDIRECT_URI = `${SUPABASE_URL}/functions/v1/rocket-buy-stripe-oauth`;
const liveKey = Deno.env.get("STRIPE_SECRET_KEY");
const stripe = liveKey?.startsWith("sk_live_") ? new Stripe(liveKey, { apiVersion: "2024-06-20" }) : null;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const accountId = /^acct_[A-Za-z0-9]+$/;
const stateToken = /^[A-Za-z0-9_-]{43}$/;
const redirect = (appId: string | null, result: string) => {
  const url = new URL("/buy-with-rocket", APP_URL);
  if (appId && uuid.test(appId)) url.searchParams.set("app", appId);
  url.searchParams.set("stripe", result);
  return new Response(null, { status: 303, headers: { Location: url.toString(), "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
};

async function ownerContext(req: Request, appId: string) {
  const user = await getRocketUser(req);
  if (!user || user.is_anonymous) return { error: json({ error: "unauthorized" }, 401) };
  const admin = getAdmin();
  const { data: permitted, error } = await admin.rpc("can_monetize_rocket_app", { p_user_id: user.id, p_app_id: appId });
  if (error) throw error;
  if (!permitted) return { error: json({ error: "rocket_developer_and_verified_ownership_required" }, 403) };
  const { data: client, error: clientError } = await admin.from("rocket_oauth_clients")
    .select("client_id,app_id,created_by,is_active,allowed_scopes")
    .eq("app_id", appId).eq("created_by", user.id).eq("environment", "production").maybeSingle();
  if (clientError) throw clientError;
  if (!client?.is_active || !client.allowed_scopes.includes("entitlements:read"))
    return { error: json({ error: "production_rocket_id_required" }, 409) };
  return { user, admin, client };
}

async function connectedAccount(id: string) {
  if (!stripe || !accountId.test(id) || id === PLATFORM_ACCOUNT_ID) throw new Error("invalid_connected_account");
  // A platform-key retrieval also verifies that this Standard account remains
  // connected; no deprecated OAuth access token is stored or sent to a client.
  const account = await stripe.accounts.retrieve(id);
  if (account.id !== id || account.type !== "standard") throw new Error("invalid_connected_account");
  return {
    id,
    name: account.business_profile?.name || account.settings?.dashboard?.display_name || null,
    country: account.country || null,
    charges_enabled: account.charges_enabled === true && account.capabilities?.card_payments === "active",
    payouts_enabled: account.payouts_enabled === true,
  };
}

async function callback(req: Request) {
  const params = new URL(req.url).searchParams;
  const state = params.get("state");
  if (!state || !stateToken.test(state)) return redirect(null, "connection_failed");
  const admin = getAdmin();
  // Consume before exchanging. Stripe warns that a second exchange of the
  // same code can revoke the connection; concurrent callbacks cannot retry it.
  const { data: attempt, error } = await admin.from("connect_merchant_oauth_attempts")
    .update({ consumed_at: new Date().toISOString() })
    .eq("state_hash", await sha256(state)).is("consumed_at", null)
    .gt("expires_at", new Date().toISOString())
    .select("id,app_id,client_id,developer_user_id").maybeSingle();
  if (error || !attempt) return redirect(null, "connection_failed");
  if (params.get("error")) return redirect(attempt.app_id, "connection_denied");
  const code = params.get("code");
  if (!code || !/^ac_[A-Za-z0-9]+$/.test(code) || params.get("scope") !== "read_write" || !liveKey)
    return redirect(attempt.app_id, "connection_failed");
  try {
    const response = await fetch("https://connect.stripe.com/oauth/token", {
      method: "POST",
      headers: { Authorization: `Basic ${btoa(`${liveKey}:`)}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "authorization_code", code }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return redirect(attempt.app_id, "connection_failed");
    const granted = await response.json() as Record<string, unknown>;
    if (granted.livemode !== true || granted.scope !== "read_write" || granted.token_type !== "bearer"
      || typeof granted.stripe_user_id !== "string" || !accountId.test(granted.stripe_user_id)
      || granted.stripe_user_id === PLATFORM_ACCOUNT_ID) return redirect(attempt.app_id, "connection_failed");
    const merchant = await connectedAccount(granted.stripe_user_id);
    const { error: saveError } = await admin.from("connect_merchant_oauth_attempts")
      .update({ stripe_account_id: merchant.id, stripe_account_name: merchant.name,
        stripe_account_country: merchant.country, charges_enabled: merchant.charges_enabled,
        payouts_enabled: merchant.payouts_enabled, authorized_at: new Date().toISOString() })
      .eq("id", attempt.id).is("authorized_at", null);
    if (saveError) throw saveError;
    return redirect(attempt.app_id, "account_ready_for_review");
  } catch {
    return redirect(attempt.app_id, "connection_failed");
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: { "Access-Control-Allow-Origin": APP_URL, "Access-Control-Allow-Headers": "authorization,apikey,content-type,x-client-info", "Access-Control-Allow-Methods": "POST,GET,OPTIONS", Vary: "Origin" } });
  if (req.method === "GET") return callback(req);
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    if (!stripe) return json({ error: "live_connect_not_configured" }, 503);
    const body = await req.json().catch(() => ({}));
    const appId = body.app_id;
    if (typeof appId !== "string" || !uuid.test(appId)) return json({ error: "invalid_app" }, 400);
    const ctx = await ownerContext(req, appId);
    if ("error" in ctx) return ctx.error!;
    const { user, admin, client } = ctx;
    if (!user || !admin || !client) return json({ error: "unavailable" }, 500);

    if (body.action === "start") {
      const state = base64url(crypto.getRandomValues(new Uint8Array(32)));
      const { error } = await admin.from("connect_merchant_oauth_attempts").insert({
        app_id: appId, client_id: client.client_id, developer_user_id: user.id,
        state_hash: await sha256(state), expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
      });
      if (error) throw error;
      const url = new URL("https://connect.stripe.com/oauth/authorize");
      url.searchParams.set("response_type", "code");
      url.searchParams.set("client_id", OAUTH_CLIENT_ID);
      url.searchParams.set("scope", "read_write");
      url.searchParams.set("redirect_uri", REDIRECT_URI);
      url.searchParams.set("state", state);
      return json({ authorization_url: url.toString() });
    }

    if (body.action === "status") {
      const { data, error } = await admin.from("connect_merchant_oauth_attempts")
        .select("id,stripe_account_id,stripe_account_name,stripe_account_country,charges_enabled,payouts_enabled,authorized_at")
        .eq("app_id", appId).eq("client_id", client.client_id).eq("developer_user_id", user.id)
        .is("activated_at", null).not("authorized_at", "is", null)
        .gt("authorized_at", new Date(Date.now() - 24 * 60 * 60_000).toISOString())
        .order("authorized_at", { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      return json({ pending_account: data || null });
    }

    if (body.action === "activate") {
      const id = body.attempt_id;
      if (typeof id !== "string" || !uuid.test(id)) return json({ error: "invalid_account_selection" }, 400);
      const { data: pending, error } = await admin.from("connect_merchant_oauth_attempts")
        .select("id,stripe_account_id,authorized_at").eq("id", id).eq("app_id", appId)
        .eq("client_id", client.client_id).eq("developer_user_id", user.id)
        .is("activated_at", null).maybeSingle();
      if (error) throw error;
      if (!pending?.authorized_at || Date.parse(pending.authorized_at) < Date.now() - 24 * 60 * 60_000
        || !pending.stripe_account_id) return json({ error: "account_selection_expired" }, 409);
      const merchant = await connectedAccount(pending.stripe_account_id);
      if (!merchant.charges_enabled || !merchant.payouts_enabled) return json({ error: "merchant_onboarding_incomplete" }, 409);
      const { data: saved, error: switchError } = await admin.rpc("connect_activate_oauth_merchant", {
        target_attempt_id: pending.id, target_client_id: client.client_id, target_app_id: appId,
        target_developer_user_id: user.id, target_stripe_account_id: merchant.id,
        target_charges_enabled: merchant.charges_enabled, target_payouts_enabled: merchant.payouts_enabled,
      }).single();
      if (switchError || !saved) return json({ error: "merchant_switch_not_safe" }, 409);
      return json({ connected: true, stripe_account_id: saved.stripe_account_id });
    }

    return json({ error: "invalid_action" }, 400);
  } catch {
    return json({ error: "merchant_connection_unavailable" }, 503);
  }
});
