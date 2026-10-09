import { createClient } from "npm:@supabase/supabase-js@2.101.1";
import { REVENUECAT_CALCULATION_VERSION, REVENUECAT_SCOPES,
  isRevenueCatId, revenueCatAuthorizationUrl, revenuePeriod,
  validateRevenueCatMetric, validateSingleAppProject,
  type RevenueCatObject } from "../_shared/revenuecatVerification.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const service = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const auth = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
const frontend = Deno.env.get("REVENUECAT_FRONTEND_ORIGIN") || "https://tryrocket.ai";
const callbackUri = `${supabaseUrl}/functions/v1/rocket-revenuecat`;
const cors = { "Access-Control-Allow-Origin": frontend,
  "Access-Control-Allow-Headers": "authorization,apikey,content-type,x-client-info,x-rocket-revenue-sync",
  "Access-Control-Allow-Methods": "POST,OPTIONS", "Cache-Control": "no-store", Vary: "Origin" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, "Content-Type": "application/json" },
});
const fail = (message: string, status = 400) => json({ error: message }, status);
const uuid = (value: unknown): value is string => typeof value === "string"
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))
  .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
const unb64 = (value: string) => Uint8Array.from(
  atob(value.replace(/-/g, "+").replace(/_/g, "/")), (character) => character.charCodeAt(0));
const random = () => b64(crypto.getRandomValues(new Uint8Array(32)));
async function sha256(value: string) {
  return b64(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))));
}
function config() {
  const clientId = Deno.env.get("REVENUECAT_OAUTH_CLIENT_ID");
  const clientSecret = Deno.env.get("REVENUECAT_OAUTH_CLIENT_SECRET");
  if (!clientId || !clientSecret) throw new Error("RevenueCat OAuth registration is required");
  return { clientId, clientSecret };
}
async function key() {
  const raw = Deno.env.get("REVENUECAT_TOKEN_ENCRYPTION_KEY");
  if (!raw) throw new Error("RevenueCat token encryption is not configured");
  const bytes = unb64(raw);
  if (bytes.length !== 32) throw new Error("RevenueCat token encryption is not configured");
  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
}
async function encrypt(value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await key(),
    new TextEncoder().encode(value));
  return { ciphertext: b64(new Uint8Array(ciphertext)), iv: b64(iv) };
}
async function decrypt(ciphertext: unknown, iv: unknown) {
  if (typeof ciphertext !== "string" || typeof iv !== "string")
    throw new Error("Reconnect RevenueCat");
  try {
    const bytes = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) },
      await key(), unb64(ciphertext));
    return new TextDecoder().decode(bytes);
  } catch { throw new Error("Reconnect RevenueCat"); }
}
async function currentUser(request: Request) {
  const token = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) throw new Error("Sign in to continue");
  const result = await auth.auth.getUser(token);
  if (result.error || !result.data.user || result.data.user.is_anonymous)
    throw new Error("Sign in to continue");
  return result.data.user.id;
}
async function ownedApp(appId: string, userId: string) {
  const owner = await service.from("app_owners").select("app_id,verification_level")
    .eq("app_id", appId).eq("user_id", userId).is("revoked_at", null).maybeSingle();
  if (owner.error || owner.data?.verification_level !== "domain_verified")
    throw new Error("A domain-verified app owner is required");
  const app = await service.from("public_apps").select("id")
    .eq("id", appId).maybeSingle();
  if (app.error || !app.data) throw new Error("App is unavailable");
}
async function connection(userId: string) {
  const result = await service.from("app_verified_revenue_connections").select("*")
    .eq("owner_user_id", userId).eq("provider", "revenuecat").maybeSingle();
  if (result.error) throw result.error;
  return result.data;
}
async function accessToken(row: Record<string, unknown>) {
  config();
  if (typeof row.access_token_expires_at === "string"
    && Date.parse(row.access_token_expires_at) > Date.now() + 120_000)
    return decrypt(row.access_token_ciphertext, row.access_token_iv);
  const refresh = await decrypt(row.refresh_token_ciphertext, row.refresh_token_iv);
  let tokens: RevenueCatObject;
  try {
    tokens = await exchange(new URLSearchParams({ grant_type: "refresh_token", refresh_token: refresh }));
  } catch {
    const updated = await connection(String(row.owner_user_id));
    if (updated && updated.refresh_token_ciphertext !== row.refresh_token_ciphertext
      && Date.parse(String(updated.access_token_expires_at || "")) > Date.now() + 120_000)
      return decrypt(updated.access_token_ciphertext, updated.access_token_iv);
    throw new Error("Reconnect RevenueCat");
  }
  const access = await encrypt(String(tokens.access_token));
  const nextRefresh = await encrypt(String(tokens.refresh_token));
  const saved = await service.from("app_verified_revenue_connections").update({
    access_token_ciphertext: access.ciphertext, access_token_iv: access.iv,
    refresh_token_ciphertext: nextRefresh.ciphertext, refresh_token_iv: nextRefresh.iv,
    access_token_expires_at: new Date(Date.now() + Number(tokens.expires_in) * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", row.id).eq("refresh_token_ciphertext", row.refresh_token_ciphertext).select("id");
  if (saved.error) throw saved.error;
  if (!saved.data?.length) {
    const updated = await connection(String(row.owner_user_id));
    if (!updated) throw new Error("Reconnect RevenueCat");
    return decrypt(updated.access_token_ciphertext, updated.access_token_iv);
  }
  return String(tokens.access_token);
}
async function exchange(body: URLSearchParams): Promise<RevenueCatObject> {
  const { clientId, clientSecret } = config();
  const response = await fetch("https://api.revenuecat.com/oauth2/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}` },
    body, signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error("RevenueCat authorization failed");
  const result = await response.json() as RevenueCatObject;
  if (result.token_type !== "Bearer" || typeof result.access_token !== "string"
    || !result.access_token.startsWith("atk_") || typeof result.refresh_token !== "string"
    || !result.refresh_token.startsWith("rtk_") || typeof result.expires_in !== "number"
    || result.expires_in < 60 || result.expires_in > 86400
    || typeof result.scope !== "string"
    || REVENUECAT_SCOPES.split(" ").some((scope) => !String(result.scope).split(" ").includes(scope)))
    throw new Error("RevenueCat authorization is missing required read permissions");
  return result;
}
async function rcGet(path: string, token: string): Promise<RevenueCatObject> {
  if (!path.startsWith("/v2/") || path.includes("..") || path.includes("//"))
    throw new Error("Invalid RevenueCat request");
  const response = await fetch(`https://api.revenuecat.com${path}`, {
    headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(response.status === 401 || response.status === 403
    ? "RevenueCat read authorization has expired or been revoked"
    : "RevenueCat data is unavailable");
  const result = await response.json();
  if (!result || typeof result !== "object" || Array.isArray(result))
    throw new Error("RevenueCat returned an invalid response");
  return result as RevenueCatObject;
}
async function rcList(path: string, token: string, maxRows = 1000): Promise<RevenueCatObject[]> {
  const rows: RevenueCatObject[] = [];
  let cursor = "";
  for (let page = 0; page < Math.ceil(maxRows / 100); page++) {
    const url = new URL(path, "https://api.revenuecat.com");
    url.searchParams.set("limit", "100");
    if (cursor) url.searchParams.set("starting_after", cursor);
    const data = await rcGet(url.pathname + url.search, token);
    if (data.object !== "list" || !Array.isArray(data.items))
      throw new Error("RevenueCat returned an invalid catalogue");
    const items = data.items as RevenueCatObject[];
    rows.push(...items);
    if (!data.next_page) return rows;
    cursor = String(items.at(-1)?.id || "");
    if (!cursor || rows.length >= maxRows) break;
  }
  throw new Error("RevenueCat catalogue exceeds the safe limit");
}
async function rcSource(projectId: string, appId: string, token: string) {
  if (!isRevenueCatId(projectId, "proj") || !isRevenueCatId(appId, "app"))
    throw new Error("Invalid RevenueCat source");
  const projects = await rcList("/v2/projects", token);
  if (!projects.some((project) => project.id === projectId))
    throw new Error("RevenueCat project is not authorized");
  const apps = await rcList(`/v2/projects/${projectId}/apps`, token);
  const products = await rcList(`/v2/projects/${projectId}/products`, token);
  const source = validateSingleAppProject(projectId, appId, apps, products);
  return { source, products: products.map((product) => ({
    id: product.id, name: String(product.display_name || product.store_identifier || product.id),
    type: product.type,
  })) };
}
async function rcMetric(projectId: string, token: string) {
  const period = revenuePeriod();
  const query = new URLSearchParams({ start_date: period.start, end_date: period.end,
    currency: "USD", revenue_type: "revenue" });
  const data = await rcGet(`/v2/projects/${projectId}/metrics/revenue?${query}`, token);
  return validateRevenueCatMetric(data, period.start, period.end);
}

async function source(appId: string) {
  const result = await service.from("app_verified_revenue_sources").select("*")
    .eq("app_id", appId).maybeSingle();
  if (result.error) throw result.error;
  return result.data;
}
async function refreshProjection(appId: string) {
  const refreshed = await service.rpc("refresh_app_verified_revenue_projection", { p_app_id: appId });
  if (refreshed.error) throw refreshed.error;
}
async function sync(appId: string, userId: string) {
  await ownedApp(appId, userId);
  const linked = await source(appId);
  if (!linked || linked.owner_user_id !== userId || linked.provider !== "revenuecat")
    throw new Error("Map a RevenueCat project first");
  const row = await connection(userId);
  if (!row || row.id !== linked.connection_id || row.status === "disconnected")
    throw new Error("Reconnect RevenueCat");
  const attempted = new Date().toISOString();
  const marked = await service.from("app_verified_revenue_sources")
    .update({ last_attempted_sync: attempted }).eq("app_id", appId)
    .eq("connection_id", row.id).eq("mapping_version", linked.mapping_version)
    .select("app_id");
  if (marked.error || !marked.data?.length)
    throw new Error("Revenue source changed during sync; retry");
  const markedConnection = await service.from("app_verified_revenue_connections")
    .update({ last_attempted_sync: attempted }).eq("id", row.id);
  if (markedConnection.error) throw markedConnection.error;
  try {
    const token = await accessToken(row);
    const catalog = await rcSource(linked.external_account_id, linked.external_app_id, token);
    if (JSON.stringify(catalog.source.productIds) !== JSON.stringify([...linked.product_ids].sort()))
      throw new Error("RevenueCat products changed; review and remap the project");
    const metric = await rcMetric(catalog.source.projectId, token);
    // Recheck after external I/O. A concurrent remap/transfer must not publish
    // an old project's metric for a new owner or app source.
    await ownedApp(appId, userId);
    const current = await source(appId);
    if (!current || current.owner_user_id !== userId || current.connection_id !== row.id
      || current.mapping_version !== linked.mapping_version
      || current.external_account_id !== linked.external_account_id
      || current.external_app_id !== linked.external_app_id)
      throw new Error("Revenue source changed during sync; retry");
    const currentConnection = await connection(userId);
    if (!currentConnection || currentConnection.id !== row.id
      || currentConnection.status === "disconnected"
      || await decrypt(currentConnection.access_token_ciphertext,
        currentConnection.access_token_iv) !== token)
      throw new Error("RevenueCat authorization changed during sync; retry");
    const observed = new Date().toISOString();
    const saved = await service.from("app_verified_revenue_points").insert({
      app_id: appId, connection_id: row.id, owner_user_id: userId,
      provider: "revenuecat", external_account_id: current.external_account_id,
      external_app_id: current.external_app_id, product_ids: catalog.source.productIds,
      mapping_version: current.mapping_version, metric_type: "gross_revenue_30d",
      value_minor: metric.valueMinor, currency: metric.currency,
      period_start: metric.periodStart, period_end: metric.periodEnd,
      observed_at: observed, verified_at: observed,
      calculation_version: REVENUECAT_CALCULATION_VERSION,
      source_environment: "production",
    });
    if (saved.error) throw saved.error;
    const sourceUpdated = await service.from("app_verified_revenue_sources")
      .update({ last_successful_sync: observed })
      .eq("app_id", appId).eq("connection_id", row.id)
      .eq("mapping_version", current.mapping_version).select("app_id");
    if (sourceUpdated.error || !sourceUpdated.data?.length)
      throw new Error("Revenue source changed during sync; retry");
    const updated = await service.from("app_verified_revenue_connections").update({
      status: "active", last_successful_sync: observed, last_error: null,
      updated_at: observed,
    }).eq("id", row.id);
    if (updated.error) throw updated.error;
    await refreshProjection(appId);
    return { provider: "revenuecat", metric_type: "gross_revenue_30d",
      value_minor: metric.valueMinor, currency: metric.currency,
      period_start: metric.periodStart, period_end: metric.periodEnd, verified_at: observed };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 160) : "RevenueCat sync failed";
    await service.from("app_verified_revenue_connections").update({
      status: "error", last_error: message, updated_at: new Date().toISOString(),
    }).eq("id", row.id);
    await refreshProjection(appId);
    throw error;
  }
}

async function callback(request: Request) {
  const url = new URL(request.url);
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  if (!state || state.length > 256) return new Response("Invalid RevenueCat authorization response", { status: 400 });
  const claimed = await service.from("app_verified_revenue_oauth_states")
    .update({ consumed_at: new Date().toISOString() })
    .eq("state_hash", await sha256(state)).is("consumed_at", null)
    .gt("expires_at", new Date().toISOString())
    .select("app_id,user_id,verifier_ciphertext,verifier_iv").maybeSingle();
  const row = claimed.data;
  if (claimed.error || !row) return new Response("Connection request expired or already used", { status: 400 });
  if (!code || code.length > 4096 || url.searchParams.has("error"))
    return Response.redirect(`${frontend}/my-apps/${encodeURIComponent(row.app_id)}/revenue?revenuecat=error`, 303);
  try {
    config();
    await ownedApp(row.app_id, row.user_id);
    const verifier = await decrypt(row.verifier_ciphertext, row.verifier_iv);
    const tokens = await exchange(new URLSearchParams({
      grant_type: "authorization_code", code, redirect_uri: callbackUri,
      code_verifier: verifier,
    }));
    const access = await encrypt(String(tokens.access_token));
    const refresh = await encrypt(String(tokens.refresh_token));
    const saved = await service.from("app_verified_revenue_connections").upsert({
      owner_user_id: row.user_id, provider: "revenuecat", status: "active",
      access_token_ciphertext: access.ciphertext, access_token_iv: access.iv,
      refresh_token_ciphertext: refresh.ciphertext, refresh_token_iv: refresh.iv,
      access_token_expires_at: new Date(Date.now() + Number(tokens.expires_in) * 1000).toISOString(),
      last_successful_sync: null, last_error: null, updated_at: new Date().toISOString(),
    }, { onConflict: "owner_user_id,provider" }).select("id").single();
    if (saved.error || !saved.data) throw new Error("RevenueCat connection could not be saved");
    // Reauthorization may change grants. Fence prior in-flight syncs and hide
    // every old projection until each bound app verifies under the new token.
    const hidden = await service.rpc("invalidate_app_verified_revenue_connection", {
      p_connection_id: saved.data.id, p_owner_user_id: row.user_id,
    });
    if (hidden.error) throw hidden.error;
    return Response.redirect(`${frontend}/my-apps/${encodeURIComponent(row.app_id)}/revenue?revenuecat=connected`, 303);
  } catch {
    return Response.redirect(`${frontend}/my-apps/${encodeURIComponent(row.app_id)}/revenue?revenuecat=error`, 303);
  }
}

async function scheduledSync(request: Request) {
  const expected = Deno.env.get("ROCKET_REVENUE_SYNC_SECRET");
  const received = request.headers.get("x-rocket-revenue-sync");
  if (!expected || !received || expected.length !== received.length)
    return fail("Unauthorized", 401);
  let mismatch = 0;
  for (let index = 0; index < expected.length; index++)
    mismatch |= expected.charCodeAt(index) ^ received.charCodeAt(index);
  if (mismatch) return fail("Unauthorized", 401);
  const due = await service.rpc("due_app_verified_revenue_sources", {
    p_provider: "revenuecat", p_limit: 20,
  });
  if (due.error) throw due.error;
  const results: Array<{ app_id: string; ok: boolean }> = [];
  for (const item of due.data || []) {
    const row = await connection(item.owner_user_id);
    if (!row || row.id !== item.connection_id || row.status === "disconnected") continue;
    try { await sync(item.app_id, item.owner_user_id); results.push({ app_id: item.app_id, ok: true }); }
    catch { results.push({ app_id: item.app_id, ok: false }); }
  }
  return json({ processed: results.length, failed: results.filter((item) => !item.ok).length });
}

async function handle(request: Request) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (request.method === "GET") return callback(request);
  if (request.method !== "POST") return fail("Method not allowed", 405);
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return fail("Invalid request"); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return fail("Invalid request");
  if (body.action === "scheduled_sync") return scheduledSync(request);
  const userId = await currentUser(request);
  if (!uuid(body.app_id)) return fail("Invalid app");
  await ownedApp(body.app_id, userId);
  const appId = body.app_id;
  if (body.action === "status") {
    const row = await connection(userId);
    const linked = await source(appId);
    if (linked && linked.owner_user_id !== userId) throw new Error("Revenue source unavailable");
    const points = linked ? await service.from("app_verified_revenue_points")
      .select("metric_type,value_minor,currency,period_start,period_end,verified_at")
      .eq("app_id", appId).eq("connection_id", linked.connection_id)
      .eq("mapping_version", linked.mapping_version).order("verified_at", { ascending: false }).limit(1) : null;
    if (points?.error) throw points.error;
    let available = false;
    try { config(); await key(); available = true; } catch { /* setup incomplete */ }
    return json({ connect_available: available,
      connection: row && row.status !== "disconnected" ? {
        status: row.status, last_attempted_sync: row.last_attempted_sync,
        last_successful_sync: row.last_successful_sync, last_error: row.last_error,
      } : null,
      source: linked?.provider === "revenuecat" ? {
        project_id: linked.external_account_id, app_id: linked.external_app_id,
        product_ids: linked.product_ids, visibility: linked.visibility,
      } : null,
      latest: points?.data?.[0] ?? null,
    });
  }
  if (body.action === "start") {
    const { clientId } = config();
    await key();
    const state = random();
    const verifier = random();
    const challenge = await sha256(verifier);
    const encrypted = await encrypt(verifier);
    const saved = await service.from("app_verified_revenue_oauth_states").insert({
      state_hash: await sha256(state), app_id: appId, user_id: userId,
      verifier_ciphertext: encrypted.ciphertext, verifier_iv: encrypted.iv,
      expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
    });
    if (saved.error) throw saved.error;
    return json({ authorization_url: revenueCatAuthorizationUrl(clientId, callbackUri, state, challenge) });
  }
  const row = await connection(userId);
  if (!row || row.status === "disconnected") throw new Error("Connect RevenueCat first");
  if (body.action === "projects") {
    const token = await accessToken(row);
    const projects = await rcList("/v2/projects", token);
    return json({ projects: projects.map((project) => ({ id: project.id, name: project.name })) });
  }
  if (body.action === "project_apps") {
    if (!isRevenueCatId(body.project_id, "proj")) return fail("Select a RevenueCat project");
    const token = await accessToken(row);
    const projects = await rcList("/v2/projects", token);
    if (!projects.some((project) => project.id === body.project_id))
      return fail("RevenueCat project is not authorized", 403);
    const apps = await rcList(`/v2/projects/${body.project_id}/apps`, token);
    return json({ apps: apps.map((app) => ({ id: app.id, name: app.name })),
      supported: apps.length === 1 });
  }
  if (body.action === "preview" || body.action === "save_mapping") {
    if (!isRevenueCatId(body.project_id, "proj") || !isRevenueCatId(body.revenuecat_app_id, "app"))
      return fail("Select a RevenueCat project and app");
    const token = await accessToken(row);
    const catalog = await rcSource(body.project_id, body.revenuecat_app_id, token);
    const metric = await rcMetric(catalog.source.projectId, token);
    if (body.action === "preview") return json({
      project_id: catalog.source.projectId, app_id: catalog.source.appId,
      products: catalog.products, metric_type: "gross_revenue_30d",
      value_minor: metric.valueMinor, currency: metric.currency,
      period_start: metric.periodStart, period_end: metric.periodEnd,
      notice: "RevenueCat project revenue includes purchases and ads, minus refunds and adjustments in the period. This project must contain only the selected app.",
    });
    if (body.confirm_all_products !== true) return fail("Confirm the complete RevenueCat product mapping");
    const bound = await service.rpc("bind_app_verified_revenue_source", {
      p_app_id: appId, p_user_id: userId, p_connection_id: row.id,
      p_provider: "revenuecat", p_external_account_id: catalog.source.projectId,
      p_external_app_id: catalog.source.appId, p_product_ids: catalog.source.productIds,
    });
    if (bound.error) {
      if (bound.error.code === "23505") return fail("This RevenueCat project is mapped to another Rocket app", 409);
      throw bound.error;
    }
    return json({ saved: true, visibility: "private", sync: await sync(appId, userId) });
  }
  const linked = await source(appId);
  if (!linked || linked.owner_user_id !== userId || linked.connection_id !== row.id
    || linked.provider !== "revenuecat") throw new Error("Map a RevenueCat project first");
  if (body.action === "sync") return json({ sync: await sync(appId, userId) });
  if (body.action === "set_visibility") {
    if (!["private", "verified_only", "range", "exact"].includes(String(body.visibility)))
      return fail("Invalid visibility");
    const updated = await service.from("app_verified_revenue_sources")
      .update({ visibility: body.visibility, updated_at: new Date().toISOString() })
      .eq("app_id", appId).eq("owner_user_id", userId).eq("connection_id", row.id);
    if (updated.error) throw updated.error;
    await refreshProjection(appId);
    return json({ visibility: body.visibility });
  }
  if (body.action === "disconnect") {
    const disconnected = await service.rpc("disconnect_app_verified_revenue", {
      p_app_id: appId, p_user_id: userId,
    });
    if (disconnected.error) throw disconnected.error;
    return json({ ok: true, provider_side_revocation: false });
  }
  return fail("Unknown action");
}

Deno.serve(async (request) => {
  try { return await handle(request); }
  catch (error) {
    const message = error instanceof Error ? error.message : "RevenueCat request failed";
    if (message === "Sign in to continue") return fail(message, 401);
    if (message === "A domain-verified app owner is required") return fail(message, 403);
    if (message === "RevenueCat OAuth registration is required"
      || message === "RevenueCat token encryption is not configured") return fail(message, 503);
    if (message.startsWith("RevenueCat") || message.startsWith("Reconnect"))
      return fail(message, 502);
    if (message === "Map a RevenueCat project first" || message === "Connect RevenueCat first"
      || message === "Revenue source changed during sync; retry") return fail(message);
    return fail("RevenueCat request failed", 500);
  }
});
