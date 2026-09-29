import { createClient } from "npm:@supabase/supabase-js@2.101.1";
import { calculateSubscriptionMrr, MRR_CALCULATION_VERSION, type MappedPrice,
  type RevenueSubscription, type RevenueItem } from "../_shared/stripeRevenueMrr.ts";

// This function never uses Rocket billing or Rocket Connect payment credentials.
// A separate Stripe App developer account must own the test OAuth installation.
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const service = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const auth = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
const frontend = Deno.env.get("STRIPE_REVENUE_FRONTEND_ORIGIN") || "https://tryrocket.ai";
const oauthUrl = Deno.env.get("STRIPE_REVENUE_TEST_OAUTH_URL");
const oauthApiKey = Deno.env.get("STRIPE_REVENUE_APP_TEST_API_KEY");
// No owner can start or manage an unverified integration unless their exact
// app ID is explicitly enrolled for the external acceptance pilot.
const pilotAppIds = new Set((Deno.env.get("STRIPE_REVENUE_PILOT_APP_IDS") || "")
  .split(",").map((id) => id.trim())
  .filter((id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)));
const pilotEnabled = (appId: string) => pilotAppIds.has(appId);
const redirectUri = `${supabaseUrl}/functions/v1/rocket-stripe-revenue`;
const cors = { "Access-Control-Allow-Origin": frontend,
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status,
  headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });
const fail = (message: string, status = 400) => json({ error: message }, status);
const uuid = (value: unknown): value is string => typeof value === "string"
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
const unb64 = (value: string) => Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")),
  (char) => char.charCodeAt(0));
const random = () => b64(crypto.getRandomValues(new Uint8Array(32)));
async function sha256(value: string) { return b64(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))); }
function configuredOAuthUrl() {
  if (!oauthUrl || !oauthApiKey) throw new Error("Stripe revenue verification is awaiting Stripe App setup");
  const url = new URL(oauthUrl);
  if (url.protocol !== "https:" || url.hostname !== "marketplace.stripe.com"
    || url.pathname !== "/oauth/v2/authorize" || !url.searchParams.get("client_id"))
    throw new Error("Stripe revenue OAuth configuration is invalid");
  return url;
}
async function encryptionKey() {
  const encoded = Deno.env.get("STRIPE_REVENUE_TOKEN_ENCRYPTION_KEY");
  if (!encoded) throw new Error("Stripe revenue encryption is not configured");
  const raw = unb64(encoded);
  if (raw.length !== 32) throw new Error("Stripe revenue encryption key must contain 32 bytes");
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}
async function encrypt(value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const bytes = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await encryptionKey(), new TextEncoder().encode(value));
  return { ciphertext: b64(new Uint8Array(bytes)), iv: b64(iv) };
}
async function decrypt(ciphertext: unknown, iv: unknown) {
  if (typeof ciphertext !== "string" || typeof iv !== "string") throw new Error("Reconnect Stripe");
  const bytes = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) },
    await encryptionKey(), unb64(ciphertext));
  return new TextDecoder().decode(bytes);
}
async function currentUser(request: Request) {
  const token = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) throw new Error("Sign in to continue");
  const { data, error } = await auth.auth.getUser(token);
  if (error || !data.user || data.user.is_anonymous) throw new Error("Sign in to continue");
  return data.user.id;
}
async function ownedApp(appId: string, userId: string) {
  const owner = await service.from("app_owners").select("app_id,verification_level")
    .eq("app_id", appId).eq("user_id", userId).is("revoked_at", null).maybeSingle();
  if (owner.error || owner.data?.verification_level !== "domain_verified")
    throw new Error("A domain-verified app owner is required");
  const app = await service.from("public_apps").select("id,canonical_host").eq("id", appId).single();
  if (app.error || !app.data) throw new Error("App is not available");
  return app.data;
}
async function binding(appId: string) {
  const result = await service.from("app_revenue_bindings").select("*").eq("app_id", appId).maybeSingle();
  if (result.error) throw result.error;
  return result.data;
}
async function connection(id: string) {
  const result = await service.from("app_revenue_connections").select("*").eq("id", id).single();
  if (result.error || !result.data) throw new Error("Stripe revenue connection unavailable");
  return result.data;
}
async function boundConnection(appId: string, userId: string) {
  const linked = await binding(appId);
  if (!linked || linked.owner_user_id !== userId) throw new Error("Connect Stripe first");
  const row = await connection(linked.connection_id);
  if (row.owner_user_id !== userId || row.provider !== "stripe" || row.status === "disconnected")
    throw new Error("Stripe revenue connection unavailable");
  return { linked, row };
}
async function tokenExchange(body: URLSearchParams) {
  if (!oauthApiKey) throw new Error("Stripe revenue verification is awaiting Stripe App setup");
  const response = await fetch("https://api.stripe.com/v1/oauth/token", { method: "POST",
    headers: { Authorization: `Basic ${btoa(`${oauthApiKey}:`)}`, "Content-Type": "application/x-www-form-urlencoded" },
    body, signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error("Stripe authorization failed");
  return await response.json() as Record<string, unknown>;
}
async function accessToken(row: Record<string, unknown>) {
  if (typeof row.access_token_expires_at === "string"
    && Date.parse(row.access_token_expires_at) > Date.now() + 120_000) {
    return await decrypt(row.access_token_ciphertext, row.access_token_iv);
  }
  const refresh = await decrypt(row.refresh_token_ciphertext, row.refresh_token_iv);
  let tokens: Record<string, unknown>;
  try { tokens = await tokenExchange(new URLSearchParams({ grant_type: "refresh_token", refresh_token: refresh })); }
  catch (error) {
    // Another invocation may already have rotated the refresh token.
    const fresh = await connection(String(row.id));
    if (fresh.refresh_token_ciphertext !== row.refresh_token_ciphertext
      && Date.parse(fresh.access_token_expires_at || "") > Date.now() + 120_000)
      return await decrypt(fresh.access_token_ciphertext, fresh.access_token_iv);
    throw error;
  }
  if (typeof tokens.access_token !== "string" || typeof tokens.refresh_token !== "string"
    || tokens.stripe_user_id !== row.external_account_id || tokens.livemode !== row.livemode)
    throw new Error("Stripe authorization changed; reconnect Stripe");
  const access = await encrypt(tokens.access_token);
  const nextRefresh = await encrypt(tokens.refresh_token);
  const updated = await service.from("app_revenue_connections").update({
    refresh_token_ciphertext: nextRefresh.ciphertext, refresh_token_iv: nextRefresh.iv,
    access_token_ciphertext: access.ciphertext, access_token_iv: access.iv,
    access_token_expires_at: new Date(Date.now() + 55 * 60_000).toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", row.id).eq("refresh_token_ciphertext", row.refresh_token_ciphertext).select("id");
  if (updated.error) throw updated.error;
  if (!updated.data?.length) {
    const fresh = await connection(String(row.id));
    return await decrypt(fresh.access_token_ciphertext, fresh.access_token_iv);
  }
  return tokens.access_token;
}
async function stripeGet(path: string, token: string) {
  const response = await fetch(`https://api.stripe.com${path}`, {
    headers: { Authorization: `Basic ${btoa(`${token}:`)}` }, signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(response.status === 403 ? "Stripe read permission was not granted"
    : "Stripe account data could not be read");
  return await response.json() as Record<string, unknown>;
}
async function stripeList(path: string, token: string, maxRows = 10_000) {
  const rows: Record<string, unknown>[] = [];
  let after = "";
  for (let page = 0; page < Math.ceil(maxRows / 100); page++) {
    const url = new URL(path, "https://api.stripe.com");
    url.searchParams.set("limit", "100");
    if (after) url.searchParams.set("starting_after", after);
    const result = await stripeGet(url.pathname + url.search, token);
    if (!Array.isArray(result.data)) throw new Error("Stripe returned an invalid list");
    const items = result.data as Record<string, unknown>[];
    rows.push(...items);
    if (!result.has_more) return rows;
    after = String(items.at(-1)?.id || "");
    if (!after || rows.length >= maxRows) break;
  }
  throw new Error("Stripe account exceeds the safe sync limit");
}
async function allSubscriptionItems(subscription: Record<string, unknown>, token: string): Promise<RevenueItem[]> {
  const items = subscription.items as { data?: RevenueItem[]; has_more?: boolean } | undefined;
  if (!items || !Array.isArray(items.data)) throw new Error("Stripe subscription items are unavailable");
  if (!items.has_more) return items.data;
  const listed = await stripeList(`/v1/subscription_items?subscription=${encodeURIComponent(String(subscription.id))}`, token, 1000);
  return listed as RevenueItem[];
}
async function mappedSubscriptions(mappings: MappedPrice[], token: string, livemode: boolean) {
  const seen = new Map<string, RevenueSubscription>();
  for (const mapping of mappings) {
    const subs = await stripeList(`/v1/subscriptions?status=all&price=${encodeURIComponent(mapping.price_id)}`, token);
    for (const entry of subs) {
      if (entry.livemode !== livemode) throw new Error("Stripe account mode changed; reconnect Stripe");
      const id = String(entry.id || "");
      if (!id || seen.has(id)) continue;
      seen.set(id, { id, status: String(entry.status || ""), livemode,
        items: await allSubscriptionItems(entry, token),
        discounts: entry.discounts as unknown[] | null,
        pause_collection: entry.pause_collection,
        cancel_at_period_end: Boolean(entry.cancel_at_period_end),
        cancel_at: typeof entry.cancel_at === "number" ? entry.cancel_at : null });
      if (seen.size > 10_000) throw new Error("Stripe account exceeds the safe sync limit");
    }
  }
  return [...seen.values()];
}
async function project(appId: string) {
  const result = await service.rpc("refresh_app_revenue_projection", { p_app_id: appId });
  if (result.error) throw result.error;
}
async function sync(appId: string, userId: string) {
  await ownedApp(appId, userId);
  const { linked, row } = await boundConnection(appId, userId);
  if (!["active", "error"].includes(row.status)) throw new Error("Reconnect Stripe before syncing");
  const mapped = await service.from("app_stripe_price_mappings")
    .select("stripe_price_id,stripe_product_id,currency")
    .eq("app_id", appId).eq("connection_id", row.id);
  if (mapped.error) throw mapped.error;
  if (!mapped.data?.length) throw new Error("Select at least one Stripe price first");
  const now = new Date().toISOString();
  await service.from("app_revenue_connections").update({ last_attempted_sync: now }).eq("id", row.id);
  try {
    const token = await accessToken(row);
    const mappings = mapped.data.map((item) => ({ price_id: item.stripe_price_id,
      product_id: item.stripe_product_id, currency: item.currency }));
    const subscriptions = await mappedSubscriptions(mappings, token, row.livemode);
    const results = calculateSubscriptionMrr(subscriptions, mappings, Math.floor(Date.now() / 1000));
    // Recheck ownership and mapping version after network I/O to avoid storing
    // a stale calculation after an app transfer or mapping edit.
    await ownedApp(appId, userId);
    const current = await binding(appId);
    if (!current || current.connection_id !== row.id || current.mapping_version !== linked.mapping_version)
      throw new Error("Price mapping changed during sync; retry");
    const observed = new Date().toISOString();
    const saved = await service.from("app_revenue_metric_points").insert(results.map((result) => ({
      app_id: appId, connection_id: row.id, provider: "stripe", metric_type: "subscription_mrr",
      ...result, mapping_version: current.mapping_version,
      calculation_version: MRR_CALCULATION_VERSION, source_livemode: row.livemode,
      observed_at: observed,
    })));
    if (saved.error) throw saved.error;
    const updated = await service.from("app_revenue_connections").update({ status: "active",
      last_successful_sync: observed, last_error: null, updated_at: observed }).eq("id", row.id);
    if (updated.error) throw updated.error;
    await project(appId);
    return { observed_at: observed, currencies: results, source_livemode: row.livemode };
  } catch (error) {
    const message = (error as Error).message.slice(0, 160);
    await service.from("app_revenue_connections").update({ status: "error", last_error: message,
      updated_at: new Date().toISOString() }).eq("id", row.id);
    await project(appId);
    throw error;
  }
}

async function callback(request: Request) {
  const url = new URL(request.url);
  const state = url.searchParams.get("state"), code = url.searchParams.get("code");
  if (!state || !code || state.length > 256 || code.length > 4096)
    return new Response("Invalid Stripe authorization response", { status: 400 });
  const claimed = await service.rpc("consume_app_revenue_oauth_state", { p_state_hash: await sha256(state) });
  const row = claimed.data?.[0];
  if (claimed.error || !row) return new Response("Connection request expired or already used", { status: 400 });
  if (!pilotEnabled(row.app_id)) return new Response("Stripe revenue pilot is unavailable", { status: 503 });
  try {
    await ownedApp(row.app_id, row.user_id);
    const tokens = await tokenExchange(new URLSearchParams({ code, grant_type: "authorization_code" }));
    if (tokens.livemode !== false || typeof tokens.stripe_user_id !== "string"
      || typeof tokens.refresh_token !== "string" || typeof tokens.access_token !== "string"
      || tokens.scope !== "stripe_apps") throw new Error("Stripe did not grant the expected test App authorization");
    const refresh = await encrypt(tokens.refresh_token);
    const access = await encrypt(tokens.access_token);
    const stored = await service.from("app_revenue_connections").upsert({
      owner_user_id: row.user_id, provider: "stripe", external_account_id: tokens.stripe_user_id,
      livemode: false, status: "active", refresh_token_ciphertext: refresh.ciphertext,
      refresh_token_iv: refresh.iv, access_token_ciphertext: access.ciphertext,
      access_token_iv: access.iv, access_token_expires_at: new Date(Date.now() + 55 * 60_000).toISOString(),
      last_error: null, updated_at: new Date().toISOString(),
    }, { onConflict: "owner_user_id,provider,external_account_id,livemode" }).select("id").single();
    if (stored.error || !stored.data) throw new Error("Could not save Stripe authorization");
    const bound = await service.rpc("bind_app_revenue_connection", { p_app_id: row.app_id,
      p_connection_id: stored.data.id, p_user_id: row.user_id });
    if (bound.error) throw bound.error;
    return Response.redirect(`${frontend}/my-apps/${encodeURIComponent(row.app_id)}/revenue`, 303);
  } catch {
    return Response.redirect(`${frontend}/my-apps/${encodeURIComponent(row.app_id)}/revenue?stripe=error`, 303);
  }
}

async function handle(request: Request) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (request.method === "GET") return callback(request);
  if (request.method !== "POST") return fail("Method not allowed", 405);
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return fail("Invalid request"); }
  const userId = await currentUser(request);
  if (!uuid(body.app_id)) return fail("Invalid app");
  const app = await ownedApp(body.app_id, userId);
  if (body.action === "status") {
    if (!pilotEnabled(app.id)) return json({ connect_available: false, connection: null,
      mapping_version: 0, visibility: "private", mappings: [], latest: [] });
    const linked = await binding(app.id);
    const row = linked ? await connection(linked.connection_id) : null;
    if (linked && (linked.owner_user_id !== userId || row?.owner_user_id !== userId))
      throw new Error("Stripe revenue connection unavailable");
    const mappings = await service.from("app_stripe_price_mappings")
      .select("stripe_product_id,stripe_price_id,currency").eq("app_id", app.id);
    if (mappings.error) throw mappings.error;
    const points = await service.rpc("latest_app_revenue_points", {
      p_app_id: app.id, p_mapping_version: linked?.mapping_version ?? 0,
    });
    if (points.error) throw points.error;
    const latest = points.data || [];
    return json({ connect_available: Boolean(oauthUrl && oauthApiKey && Deno.env.get("STRIPE_REVENUE_TOKEN_ENCRYPTION_KEY")),
      connection: row ? { status: row.status, external_account_id: row.external_account_id,
      livemode: row.livemode, last_attempted_sync: row.last_attempted_sync,
      last_successful_sync: row.last_successful_sync, last_error: row.last_error } : null,
    mapping_version: linked?.mapping_version ?? 0, visibility: linked?.visibility ?? "private",
    mappings: mappings.data || [], latest });
  }
  if (!pilotEnabled(app.id)) return fail("Stripe revenue verification is coming soon", 503);
  if (body.action === "start") {
    const url = configuredOAuthUrl();
    const state = random();
    const saved = await service.from("app_revenue_oauth_states").insert({
      state_hash: await sha256(state), app_id: app.id, user_id: userId,
      expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
    });
    if (saved.error) throw saved.error;
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("state", state);
    return json({ authorization_url: url.toString() });
  }
  const { linked, row } = await boundConnection(app.id, userId);
  if (body.action === "catalog") {
    const token = await accessToken(row);
    const prices = await stripeList("/v1/prices?type=recurring&expand[]=data.product", token, 2000);
    return json({ prices: prices.filter((price) => price.active && price.recurring
      && price.billing_scheme === "per_unit" && price.transform_quantity == null
      && price.tiers_mode == null && typeof price.unit_amount_decimal === "string"
      && (price.recurring as Record<string, unknown>).usage_type === "licensed"
      && ["month", "year"].includes(String((price.recurring as Record<string, unknown>).interval)))
      .map((price) => ({
      id: price.id, product_id: typeof price.product === "string" ? price.product
        : (price.product as Record<string, unknown> | null)?.id,
      product_name: typeof price.product === "object" && price.product
        ? String((price.product as Record<string, unknown>).name || "Product") : "Product",
      currency: price.currency, unit_amount_decimal: price.unit_amount_decimal,
      interval: (price.recurring as Record<string, unknown>).interval,
      interval_count: (price.recurring as Record<string, unknown>).interval_count,
    })) });
  }
  if (body.action === "save_mapping") {
    if (!Array.isArray(body.price_ids) || body.price_ids.length > 100
      || !body.price_ids.every((id) => typeof id === "string" && /^price_[A-Za-z0-9]+$/.test(id))
      || new Set(body.price_ids).size !== body.price_ids.length) return fail("Invalid Stripe prices");
    const token = await accessToken(row);
    const selected: Array<{ price_id: string; product_id: string; currency: string }> = [];
    for (const id of body.price_ids as string[]) {
      const price = await stripeGet(`/v1/prices/${encodeURIComponent(id)}`, token);
      if (price.id !== id || price.type !== "recurring" || typeof price.product !== "string"
        || !/^prod_[A-Za-z0-9]+$/.test(price.product)
        || typeof price.currency !== "string" || !/^[a-z]{3}$/.test(price.currency)
        || price.livemode !== row.livemode || price.billing_scheme !== "per_unit"
        || price.transform_quantity != null || price.tiers_mode != null
        || typeof price.unit_amount_decimal !== "string"
        || typeof price.recurring !== "object" || !price.recurring
        || (price.recurring as Record<string, unknown>).usage_type !== "licensed"
        || !["month", "year"].includes(String((price.recurring as Record<string, unknown>).interval)))
        return fail("A selected Stripe price is unavailable or unsupported");
      selected.push({ price_id: id, product_id: price.product, currency: price.currency });
    }
    const replaced = await service.rpc("replace_app_stripe_price_mappings", {
      p_app_id: app.id, p_connection_id: row.id, p_user_id: userId, p_prices: selected,
    });
    if (replaced.error) {
      if (replaced.error.code === "23505") return fail("A price is already assigned to another Rocket app", 409);
      throw replaced.error;
    }
    return json({ mapping_version: replaced.data, mapped_prices: selected.length });
  }
  if (body.action === "sync") return json({ sync: await sync(app.id, userId) });
  if (body.action === "set_visibility") {
    if (!["private", "verified_only", "range", "exact"].includes(String(body.visibility)))
      return fail("Invalid visibility");
    const updated = await service.from("app_revenue_bindings").update({ visibility: body.visibility,
      updated_at: new Date().toISOString() }).eq("app_id", app.id).eq("connection_id", row.id);
    if (updated.error) throw updated.error;
    await project(app.id);
    return json({ visibility: body.visibility,
      publicly_eligible: Boolean(row.livemode && row.status === "active") });
  }
  if (body.action === "disconnect") {
    const disconnected = await service.rpc("disconnect_app_revenue", { p_app_id: app.id, p_user_id: userId });
    if (disconnected.error) throw disconnected.error;
    return json({ ok: true });
  }
  return fail("Unknown action");
}

Deno.serve(async (request) => {
  try { return await handle(request); }
  catch (error) {
    const message = (error as Error).message;
    if (message === "Sign in to continue") return fail(message, 401);
    if (message === "A domain-verified app owner is required") return fail(message, 403);
    if (message === "Stripe revenue verification is awaiting Stripe App setup") return fail(message, 503);
    if (["Connect Stripe first", "Select at least one Stripe price first", "Reconnect Stripe before syncing",
      "Price mapping changed during sync; retry", "Stripe account exceeds the safe sync limit"].includes(message))
      return fail(message, 400);
    if (message.startsWith("Stripe") || message.startsWith("Reconnect")) return fail(message, 502);
    return fail("Stripe revenue request failed", 500);
  }
});
