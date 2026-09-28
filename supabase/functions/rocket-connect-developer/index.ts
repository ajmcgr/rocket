import Stripe from "npm:stripe@16.12.0";
import { APP_URL, base64url, getAdmin, getRocketUser, json, sha256, validRedirectUri } from "../_shared/rocketConnect.ts";

const stripeKey = Deno.env.get("STRIPE_CONNECT_TEST_SECRET_KEY");
const stripe = stripeKey?.startsWith("sk_test_") ? new Stripe(stripeKey, { apiVersion: "2024-06-20" }) : null;
const scopes = ["openid", "profile", "email", "entitlements:read"];
// New legacy Express accounts are rejected for direct charges. Keep this
// server-side kill switch until Accounts v2 eligibility is confirmed; clients
// must not be able to bypass the portal and create another legacy account.
const STRIPE_ONBOARDING_PAUSED = true;
const publicClientId = () => `rocket-dev-${base64url(crypto.getRandomValues(new Uint8Array(18)))}`;

function normaliseEmail(value: unknown) { return typeof value === "string" ? value.trim().toLowerCase() : ""; }
function string(value: unknown, max = 240) { return typeof value === "string" && value.trim().length > 0 && value.trim().length <= max ? value.trim() : null; }
function validInviteToken(value: unknown) { return typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value); }
function validIcon(url: string | null) {
  if (!url) return true;
  try { const parsed = new URL(url); return parsed.protocol === "https:" && !parsed.username && !parsed.password; } catch { return false; }
}
function validReturnUri(uri: string | null) { return !!uri && validRedirectUri(uri); }
function productKey(name: string) {
  const prefix = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "subscription";
  return `${prefix}-${base64url(crypto.getRandomValues(new Uint8Array(5))).toLowerCase()}`;
}

async function actor(req: Request) {
  const user = await getRocketUser(req);
  if (!user) return null;
  const admin = getAdmin();
  const [{ data: developer }, { data: operator }] = await Promise.all([
    admin.from("connect_developers").select("user_id").eq("user_id", user.id).maybeSingle(),
    admin.from("connect_developer_operators").select("user_id").eq("user_id", user.id).maybeSingle(),
  ]);
  return { user, admin, developer: !!developer, operator: !!operator };
}

async function ownedClient(admin: ReturnType<typeof getAdmin>, userId: string, clientId: unknown) {
  if (typeof clientId !== "string") return null;
  const { data } = await admin.from("rocket_oauth_clients")
    .select("client_id,name,icon_url,redirect_uris,checkout_return_uris,allowed_scopes,is_active,created_at")
    .eq("client_id", clientId).eq("created_by", userId).maybeSingle();
  return data as any | null;
}

async function refreshAccount(admin: ReturnType<typeof getAdmin>, clientId: string, ownerId: string) {
  const { data: account } = await admin.from("connect_developer_accounts")
    .select("id,client_id,stripe_account_id,status,charges_enabled,payouts_enabled")
    .eq("client_id", clientId).eq("developer_user_id", ownerId).maybeSingle();
  if (!account || !stripe) return account as any | null;
  const remote = await stripe.accounts.retrieve(account.stripe_account_id);
  const active = !!remote.charges_enabled && !!remote.payouts_enabled;
  const status = active ? "active" : "pending";
  if (account.status !== status || account.charges_enabled !== !!remote.charges_enabled || account.payouts_enabled !== !!remote.payouts_enabled) {
    await admin.from("connect_developer_accounts").update({ status, charges_enabled: !!remote.charges_enabled, payouts_enabled: !!remote.payouts_enabled, updated_at: new Date().toISOString() }).eq("id", account.id);
  }
  return { ...account, status, charges_enabled: !!remote.charges_enabled, payouts_enabled: !!remote.payouts_enabled } as any;
}

async function dashboard(ctx: NonNullable<Awaited<ReturnType<typeof actor>>>) {
  const { data: apps, error } = await ctx.admin.from("rocket_oauth_clients")
    .select("client_id,name,icon_url,redirect_uris,checkout_return_uris,allowed_scopes,is_active,created_at")
    .eq("created_by", ctx.user.id).order("created_at", { ascending: false });
  if (error) throw error;
  return { developer: ctx.developer, operator: ctx.operator, apps: apps || [] };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: { "Access-Control-Allow-Origin": APP_URL, "Access-Control-Allow-Headers": "authorization,apikey,content-type,x-client-info", "Access-Control-Allow-Methods": "GET,POST,OPTIONS", Vary: "Origin" } });
  const ctx = await actor(req);
  if (!ctx) return json({ error: "unauthorized" }, 401);
  const action = new URL(req.url).searchParams.get("action") || (req.method === "POST" ? (await req.clone().json().catch(() => ({})) as any).action : "dashboard");
  try {
    if (req.method === "GET" && action === "dashboard") return json(await dashboard(ctx));
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    const body = await req.json().catch(() => ({}));

    if (action === "invite") {
      if (!ctx.operator) return json({ error: "forbidden" }, 403);
      const email = normaliseEmail(body.email);
      const token = body.token;
      if (!/^\S+@\S+\.\S+$/.test(email) || !validInviteToken(token)) return json({ error: "invalid_invitation_request" }, 400);
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60_000).toISOString();
      const { data: existing } = await ctx.admin.from("connect_developer_invitations").select("id").eq("email", email).is("accepted_at", null).maybeSingle();
      const invitation = { email, token_hash: await sha256(token), invited_by: ctx.user.id, expires_at: expiresAt };
      const { error } = existing
        ? await ctx.admin.from("connect_developer_invitations").update(invitation).eq("id", existing.id)
        : await ctx.admin.from("connect_developer_invitations").insert(invitation);
      if (error) throw error;
      return json({ invitation_url: `${APP_URL}/developer/activate?token=${encodeURIComponent(token)}`, expires_at: expiresAt });
    }

    if (action === "accept_invite") {
      const token = string(body.token, 512); const email = normaliseEmail(ctx.user.email);
      if (!token || !email) return json({ error: "invalid_invitation" }, 400);
      const { data: invitation } = await ctx.admin.from("connect_developer_invitations").select("id,email,invited_by,expires_at,accepted_at")
        .eq("token_hash", await sha256(token)).maybeSingle();
      if (!invitation || invitation.email !== email || invitation.accepted_at || new Date(invitation.expires_at).getTime() <= Date.now()) return json({ error: "invalid_invitation" }, 400);
      const { error: developerError } = await ctx.admin.from("connect_developers").upsert({ user_id: ctx.user.id, invited_by: invitation.invited_by }, { onConflict: "user_id" });
      if (developerError) throw developerError;
      const { data: accepted } = await ctx.admin.from("connect_developer_invitations").update({ accepted_by: ctx.user.id, accepted_at: new Date().toISOString() })
        .eq("id", invitation.id).is("accepted_at", null).select("id").maybeSingle();
      if (!accepted) return json({ error: "invalid_invitation" }, 400);
      return json({ activated: true });
    }

    if (!ctx.developer) return json({ error: "developer_access_required" }, 403);

    if (action === "create_app") {
      const name = string(body.name, 120); const redirectUri = string(body.redirect_uri, 2048); const returnUri = string(body.checkout_return_uri, 2048);
      const iconUrl = body.icon_url === "" || body.icon_url == null ? null : string(body.icon_url, 2048);
      if (!name || !redirectUri || !returnUri || !validRedirectUri(redirectUri) || !validReturnUri(returnUri) || !validIcon(iconUrl)) return json({ error: "invalid_app_configuration" }, 400);
      const clientId = publicClientId();
      const { data, error } = await ctx.admin.from("rocket_oauth_clients").insert({ client_id: clientId, name, icon_url: iconUrl, redirect_uris: [redirectUri], checkout_return_uris: [returnUri], allowed_scopes: scopes, client_type: "public", is_active: true, created_by: ctx.user.id }).select("client_id,name,icon_url,redirect_uris,checkout_return_uris,allowed_scopes,is_active,created_at").single();
      if (error) throw error;
      return json({ app: data }, 201);
    }

    const client = await ownedClient(ctx.admin, ctx.user.id, body.client_id);
    if (!client) return json({ error: "app_not_found" }, 404);
    if (!client.is_active && !["app_detail", "update_app", "set_app_status"].includes(action)) return json({ error: "app_disabled" }, 403);

    if (action === "app_detail") {
      const account = await refreshAccount(ctx.admin, client.client_id, ctx.user.id);
      const { data: products, error } = await ctx.admin.from("connect_products").select("id,product_key,name,stripe_product_id,stripe_price_id,amount_cents,currency,interval,platform_fee_bps,is_active,checkout_return_uris,created_at")
        .eq("client_id", client.client_id).eq("developer_user_id", ctx.user.id).order("created_at", { ascending: false });
      if (error) throw error;
      return json({ app: client, stripe_account: account, products: products || [] });
    }

    if (action === "update_app") {
      const name = string(body.name, 120);
      const redirectUri = string(body.redirect_uri, 2048);
      const returnUri = string(body.checkout_return_uri, 2048);
      const iconUrl = body.icon_url === "" || body.icon_url == null ? null : string(body.icon_url, 2048);
      if (!name || !redirectUri || !returnUri || !validRedirectUri(redirectUri) || !validReturnUri(returnUri) || !validIcon(iconUrl)) return json({ error: "invalid_app_configuration" }, 400);
      const { data, error } = await ctx.admin.from("rocket_oauth_clients")
        .update({ name, icon_url: iconUrl, redirect_uris: [redirectUri], checkout_return_uris: [returnUri], updated_at: new Date().toISOString() })
        .eq("client_id", client.client_id).eq("created_by", ctx.user.id)
        .select("client_id,name,icon_url,redirect_uris,checkout_return_uris,allowed_scopes,is_active,created_at").single();
      if (error) throw error;
      await ctx.admin.from("rocket_oauth_events").insert({ user_id: ctx.user.id, client_id: client.client_id, event_type: "client_updated", detail: {} });
      return json({ app: data });
    }

    if (action === "set_app_status") {
      if (typeof body.is_active !== "boolean") return json({ error: "invalid_request" }, 400);
      const { data, error } = await ctx.admin.from("rocket_oauth_clients")
        .update({ is_active: body.is_active, updated_at: new Date().toISOString() })
        .eq("client_id", client.client_id).eq("created_by", ctx.user.id)
        .select("client_id,name,icon_url,redirect_uris,checkout_return_uris,allowed_scopes,is_active,created_at").single();
      if (error) throw error;
      if (!body.is_active) {
        const revokedAt = new Date().toISOString();
        const [{ error: tokenError }, { error: codeError }] = await Promise.all([
          ctx.admin.from("rocket_oauth_access_tokens").update({ revoked_at: revokedAt }).eq("client_id", client.client_id).is("revoked_at", null),
          ctx.admin.from("rocket_oauth_codes").update({ consumed_at: revokedAt }).eq("client_id", client.client_id).is("consumed_at", null),
        ]);
        if (tokenError || codeError) throw tokenError || codeError;
      }
      await ctx.admin.from("rocket_oauth_events").insert({ user_id: ctx.user.id, client_id: client.client_id, event_type: body.is_active ? "client_enabled" : "client_disabled", detail: {} });
      return json({ app: data });
    }

    if (action === "stripe_onboarding") {
      if (STRIPE_ONBOARDING_PAUSED) return json({ error: "stripe_onboarding_paused" }, 503);
      if (!stripe) return json({ error: "connect_test_mode_not_configured" }, 503);
      let account = await refreshAccount(ctx.admin, client.client_id, ctx.user.id);
      if (!account) {
        const remote = await stripe.accounts.create({ type: "express", email: ctx.user.email || undefined, capabilities: { card_payments: { requested: true }, transfers: { requested: true } }, metadata: { rocket_client_id: client.client_id, rocket_developer_user_id: ctx.user.id, rocket_environment: "test" } });
        const { data, error } = await ctx.admin.from("connect_developer_accounts").insert({ client_id: client.client_id, developer_user_id: ctx.user.id, stripe_account_id: remote.id, status: "pending", charges_enabled: !!remote.charges_enabled, payouts_enabled: !!remote.payouts_enabled }).select("id,client_id,stripe_account_id,status,charges_enabled,payouts_enabled").single();
        if (error) throw error; account = data;
      }
      const destination = `${APP_URL}/developer/apps/${encodeURIComponent(client.client_id)}?stripe=return`;
      const link = await stripe.accountLinks.create({ account: account.stripe_account_id, refresh_url: `${destination}&refresh=1`, return_url: destination, type: "account_onboarding" });
      return json({ onboarding_url: link.url, stripe_account: account });
    }

    if (action === "stripe_status") return json({ stripe_account: await refreshAccount(ctx.admin, client.client_id, ctx.user.id) });

    if (action === "create_product") {
      if (STRIPE_ONBOARDING_PAUSED) return json({ error: "stripe_onboarding_paused" }, 503);
      if (!stripe) return json({ error: "connect_test_mode_not_configured" }, 503);
      const account = await refreshAccount(ctx.admin, client.client_id, ctx.user.id);
      const name = string(body.name, 120); const checkoutReturnUri = string(body.checkout_return_uri, 2048); const amount = body.amount_cents;
      if (!account || account.status !== "active" || !account.charges_enabled || !account.payouts_enabled) return json({ error: "stripe_onboarding_incomplete" }, 403);
      if (!name || !validReturnUri(checkoutReturnUri) || !client.checkout_return_uris?.includes(checkoutReturnUri) || !Number.isInteger(amount) || amount < 100 || amount > 100000) return json({ error: "invalid_product_configuration" }, 400);
      const product = await stripe.products.create({ name, metadata: { rocket_client_id: client.client_id, rocket_developer_user_id: ctx.user.id, rocket_environment: "test" } }, { stripeAccount: account.stripe_account_id });
      const price = await stripe.prices.create({ product: product.id, currency: "usd", unit_amount: amount, recurring: { interval: "month" }, metadata: { rocket_client_id: client.client_id, rocket_environment: "test" } }, { stripeAccount: account.stripe_account_id });
      const { data, error } = await ctx.admin.from("connect_products").insert({ client_id: client.client_id, developer_account_id: account.id, developer_user_id: ctx.user.id, product_key: productKey(name), name, stripe_product_id: product.id, stripe_price_id: price.id, amount_cents: amount, currency: "usd", interval: "month", platform_fee_bps: 1000, is_active: true, checkout_return_uris: [checkoutReturnUri] }).select("id,product_key,name,stripe_product_id,stripe_price_id,amount_cents,currency,interval,platform_fee_bps,is_active,checkout_return_uris,created_at").single();
      if (error) throw error;
      return json({ product: data }, 201);
    }
    return json({ error: "invalid_action" }, 400);
  } catch (error) { console.error("rocket-connect-developer", error); return json({ error: "developer_portal_unavailable" }, 500); }
});
