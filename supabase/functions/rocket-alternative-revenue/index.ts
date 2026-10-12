import { createClient } from "npm:@supabase/supabase-js@2.101.1";
import { completeThirtyDayPeriod, verifiedDodoPaidVolume, verifiedPolarRevenue,
  verifiedProductIds, type RevenueProvider } from "../_shared/alternativeRevenueVerification.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const service = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const auth = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
const origin = Deno.env.get("APP_URL") || "https://tryrocket.ai";
const cors = { "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Headers": "authorization,apikey,content-type,x-client-info,x-rocket-revenue-sync",
  "Access-Control-Allow-Methods": "POST,OPTIONS", "Cache-Control": "no-store", Vary: "Origin" };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { ...cors, "Content-Type": "application/json" },
});
const uuid = (value: unknown): value is string => typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const providerOf = (value: unknown): value is RevenueProvider => value === "polar" || value === "dodo";
const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))
  .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
const unb64 = (value: string) => Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")),
  (character) => character.charCodeAt(0));
async function key() {
  const raw = Deno.env.get("ALTERNATIVE_REVENUE_ENCRYPTION_KEY") ||
    Deno.env.get("POSTHOG_TOKEN_ENCRYPTION_KEY");
  if (!raw) throw new Error("Revenue credential storage is unavailable");
  const bytes = unb64(raw);
  if (bytes.length !== 32) throw new Error("Revenue credential storage is unavailable");
  // Reuse the existing Rocket secret only as input key material. HKDF gives
  // payment-provider tokens their own cryptographically separated AES key.
  if (!Deno.env.get("ALTERNATIVE_REVENUE_ENCRYPTION_KEY")) {
    const material = await crypto.subtle.importKey("raw", bytes, "HKDF", false, ["deriveKey"]);
    return crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256",
      salt: new TextEncoder().encode("rocket:alternative-revenue:v1"),
      info: new TextEncoder().encode("polar-dodo-credentials") },
    material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  }
  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
}
async function encrypt(value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await key(),
    new TextEncoder().encode(value));
  return { ciphertext: b64(new Uint8Array(ciphertext)), iv: b64(iv) };
}
async function decrypt(ciphertext: unknown, iv: unknown) {
  if (typeof ciphertext !== "string" || typeof iv !== "string") throw new Error("Reconnect provider");
  try {
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) },
      await key(), unb64(ciphertext));
    return new TextDecoder().decode(plain);
  } catch { throw new Error("Reconnect provider"); }
}
async function userId(request: Request) {
  const token = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) throw new Error("Sign in to continue");
  const result = await auth.auth.getUser(token);
  if (result.error || !result.data.user || result.data.user.is_anonymous)
    throw new Error("Sign in to continue");
  return result.data.user.id;
}
async function ownedApp(appId: string, ownerId: string) {
  const owner = await service.from("app_owners").select("verification_level")
    .eq("app_id", appId).eq("user_id", ownerId).is("revoked_at", null).maybeSingle();
  if (owner.error || owner.data?.verification_level !== "domain_verified")
    throw new Error("A domain-verified app owner is required");
  const app = await service.from("public_apps").select("id").eq("id", appId).maybeSingle();
  if (app.error || !app.data) throw new Error("App is unavailable");
}
async function api(provider: RevenueProvider, path: string, token: string) {
  // All paths are constructed here from fixed routes and encoded IDs. There is
  // no arbitrary URL, host, or method submitted by the browser.
  const base = provider === "polar" ? "https://api.polar.sh" : "https://live.dodopayments.com";
  if (!path.startsWith("/") || path.includes("..") || path.includes("//")) throw new Error("Invalid provider path");
  const response = await fetch(`${base}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(response.status === 401 || response.status === 403
    ? `${provider} read authorization failed` : `${provider} data is unavailable`);
  const data = await response.json();
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Invalid provider response");
  return data as Record<string, unknown>;
}
async function paged(provider: RevenueProvider, route: string, token: string) {
  const items: Record<string, unknown>[] = [];
  for (let page = 1; page <= 10; page++) {
    const sep = route.includes("?") ? "&" : "?";
    const path = provider === "polar"
      ? `${route}${sep}page=${page}&limit=100`
      : `${route}${sep}page_number=${page}&page_size=100`;
    const data = await api(provider, path, token);
    if (!Array.isArray(data.items)) throw new Error("Invalid provider catalogue");
    items.push(...data.items as Record<string, unknown>[]);
    if (data.items.length < 100) return items;
  }
  throw new Error("Provider catalogue exceeds the safe limit");
}
async function currentConnection(ownerId: string, provider: RevenueProvider) {
  const result = await service.from("app_verified_revenue_connections").select("*")
    .eq("owner_user_id", ownerId).eq("provider", provider).maybeSingle();
  if (result.error) throw result.error;
  return result.data;
}
async function currentSource(appId: string) {
  const result = await service.from("app_verified_revenue_sources").select("*")
    .eq("app_id", appId).maybeSingle();
  if (result.error) throw result.error;
  return result.data;
}
async function selection(appId: string) {
  const result = await service.from("app_provider_selection").select("revenue_provider")
    .eq("app_id", appId).maybeSingle();
  if (result.error) throw result.error;
  return result.data?.revenue_provider ?? null;
}
async function refreshProjection(appId: string) {
  const result = await service.rpc("refresh_app_verified_revenue_projection", { p_app_id: appId });
  if (result.error) throw result.error;
}
async function polarSource(token: string, organizationId: string) {
  if (!uuid(organizationId)) throw new Error("Select a Polar organization");
  const org = await api("polar", `/v1/organizations/${organizationId}`, token);
  if (org.id !== organizationId) throw new Error("Polar organization is not authorized");
  const products = await paged("polar", `/v1/products?organization_id=${encodeURIComponent(organizationId)}`, token);
  const productIds = verifiedProductIds(products, "id", "organization_id", organizationId);
  const period = completeThirtyDayPeriod();
  const query = new URLSearchParams({ start_date: period.start, end_date: period.end,
    timezone: "UTC", interval: "day", organization_id: organizationId, metrics: "revenue" });
  const metric = await api("polar", `/v1/metrics/?${query}`, token);
  return { accountId: organizationId, accountName: String(org.name || organizationId),
    appId: organizationId, products: products.map((p) => ({ id: p.id, name: p.name })),
    productIds, valueMinor: verifiedPolarRevenue(metric), period,
    metricType: "gross_revenue_30d" as const };
}
async function dodoSource(token: string, brandId: string) {
  if (!/^\w[\w-]{2,254}$/.test(brandId)) throw new Error("Select a Dodo brand");
  const brands = await api("dodo", "/brands", token);
  if (!Array.isArray(brands.items)) throw new Error("Dodo brands are unavailable");
  const brand = (brands.items as Record<string, unknown>[]).find((b) => b.brand_id === brandId);
  if (!brand || typeof brand.business_id !== "string") throw new Error("Dodo brand is not authorized");
  const products = await paged("dodo", `/products?brand_id=${encodeURIComponent(brandId)}`, token);
  const productIds = verifiedProductIds(products, "product_id", "business_id", brand.business_id);
  const period = completeThirtyDayPeriod();
  const query = new URLSearchParams({ brand_id: brandId,
    created_at_gte: `${period.start}T00:00:00.000Z`, created_at_lte: `${period.end}T23:59:59.999Z` });
  const payments = await paged("dodo", `/payments?${query}`, token);
  if (payments.length > 5000) throw new Error("Dodo payment history exceeds the safe limit");
  return { accountId: brandId, accountName: String(brand.name || brandId), appId: brandId,
    products: products.map((p) => ({ id: p.product_id, name: p.name })), productIds,
    valueMinor: verifiedDodoPaidVolume(payments, brandId, period), period,
    metricType: "paid_volume_30d" as const };
}
async function providerSource(provider: RevenueProvider, token: string, accountId: string) {
  return provider === "polar" ? polarSource(token, accountId) : dodoSource(token, accountId);
}
async function sync(appId: string, ownerId: string, provider: RevenueProvider) {
  await ownedApp(appId, ownerId);
  const source = await currentSource(appId);
  const row = await currentConnection(ownerId, provider);
  if (!source || source.owner_user_id !== ownerId || source.provider !== provider ||
    !row || row.id !== source.connection_id || row.status === "disconnected")
    throw new Error("Map a provider source first");
  const attempted = new Date().toISOString();
  const marked = await service.from("app_verified_revenue_sources")
    .update({ last_attempted_sync: attempted }).eq("app_id", appId)
    .eq("connection_id", row.id).eq("mapping_version", source.mapping_version).select("app_id");
  if (marked.error || !marked.data?.length) throw new Error("Revenue source changed; retry");
  try {
    const token = await decrypt(row.access_token_ciphertext, row.access_token_iv);
    const fresh = await providerSource(provider, token, source.external_account_id);
    if (JSON.stringify(fresh.productIds) !== JSON.stringify([...source.product_ids].sort()))
      throw new Error("Provider products changed; review and remap");
    await ownedApp(appId, ownerId);
    const current = await currentSource(appId);
    const credential = await currentConnection(ownerId, provider);
    if (!current || !credential || current.owner_user_id !== ownerId || current.provider !== provider ||
      current.connection_id !== row.id || current.mapping_version !== source.mapping_version ||
      current.external_account_id !== source.external_account_id ||
      credential.access_token_ciphertext !== row.access_token_ciphertext ||
      credential.status === "disconnected") throw new Error("Revenue source changed; retry");
    const observed = new Date().toISOString();
    const saved = await service.from("app_verified_revenue_points").insert({
      app_id: appId, connection_id: row.id, owner_user_id: ownerId, provider,
      external_account_id: source.external_account_id, external_app_id: source.external_app_id,
      product_ids: fresh.productIds, mapping_version: source.mapping_version,
      metric_type: fresh.metricType, value_minor: fresh.valueMinor, currency: "USD",
      period_start: fresh.period.start, period_end: fresh.period.end,
      observed_at: observed, verified_at: observed, calculation_version: 1,
      source_environment: "production",
    });
    if (saved.error) throw saved.error;
    const updatedSource = await service.from("app_verified_revenue_sources")
      .update({ last_successful_sync: observed }).eq("app_id", appId)
      .eq("connection_id", row.id).eq("mapping_version", source.mapping_version).select("app_id");
    if (updatedSource.error || !updatedSource.data?.length) throw new Error("Revenue source changed; retry");
    const updatedConnection = await service.from("app_verified_revenue_connections")
      .update({ status: "active", last_successful_sync: observed, last_error: null, updated_at: observed })
      .eq("id", row.id).eq("access_token_ciphertext", row.access_token_ciphertext);
    if (updatedConnection.error) throw updatedConnection.error;
    await refreshProjection(appId);
    return { metric_type: fresh.metricType, value_minor: fresh.valueMinor,
      currency: "USD", period_start: fresh.period.start, period_end: fresh.period.end,
      verified_at: observed };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 160) : "Provider sync failed";
    await service.from("app_verified_revenue_connections")
      .update({ status: "error", last_error: message, updated_at: new Date().toISOString() })
      .eq("id", row.id).eq("access_token_ciphertext", row.access_token_ciphertext);
    await refreshProjection(appId);
    throw error;
  }
}
async function scheduled(request: Request) {
  const expected = Deno.env.get("ROCKET_REVENUE_SYNC_SECRET") || Deno.env.get("POSTHOG_SYNC_SECRET");
  const received = request.headers.get("x-rocket-revenue-sync");
  if (!expected || !received || expected.length !== received.length) return json({ error: "Unauthorized" }, 401);
  let difference = 0;
  for (let i = 0; i < expected.length; i++) difference |= expected.charCodeAt(i) ^ received.charCodeAt(i);
  if (difference) return json({ error: "Unauthorized" }, 401);
  await key();
  const results = [];
  for (const provider of ["polar", "dodo"] as const) {
    const due = await service.rpc("due_app_verified_revenue_sources", { p_provider: provider, p_limit: 20 });
    if (due.error) throw due.error;
    for (const item of due.data || []) {
      try { await sync(item.app_id, item.owner_user_id, provider); results.push({ provider, ok: true }); }
      catch { results.push({ provider, ok: false }); }
    }
  }
  return json({ processed: results.length, failed: results.filter((r) => !r.ok).length });
}
async function handle(request: Request) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const body = await request.json();
  if (!body || typeof body !== "object" || Array.isArray(body) ||
    !providerOf(body.provider)) return json({ error: "Invalid provider" }, 400);
  if (body.action === "scheduled_sync") return scheduled(request);
  const ownerId = await userId(request);
  if (!uuid(body.app_id)) return json({ error: "Invalid app" }, 400);
  const appId = body.app_id;
  const provider = body.provider;
  await ownedApp(appId, ownerId);
  const connection = await currentConnection(ownerId, provider);
  const linked = await currentSource(appId);
  if (linked && linked.owner_user_id !== ownerId) throw new Error("Revenue source unavailable");
  if (body.action === "status") {
    const points = linked?.provider === provider ? await service.from("app_verified_revenue_points")
      .select("metric_type,value_minor,currency,period_start,period_end,verified_at")
      .eq("app_id", appId).eq("connection_id", linked.connection_id)
      .eq("mapping_version", linked.mapping_version)
      .order("verified_at", { ascending: false }).limit(1) : null;
    if (points?.error) throw points.error;
    let available = false;
    try { await key(); available = true; } catch { /* no storage key */ }
    return json({ connect_available: available, selected_provider: await selection(appId),
      connection: connection && connection.status !== "disconnected" ? {
        status: connection.status, last_successful_sync: connection.last_successful_sync,
        last_error: connection.last_error,
      } : null,
      source: linked?.provider === provider ? { account_id: linked.external_account_id,
        product_ids: linked.product_ids, visibility: linked.visibility } : null,
      latest: points?.data?.[0] ?? null });
  }
  if (body.action === "connect") {
    if (typeof body.credential !== "string" || body.credential.length < 12 || body.credential.length > 2048)
      return json({ error: "Enter a provider read-only key" }, 400);
    await key();
    // Authorize against the live provider endpoint before storing anything.
    const accounts = provider === "polar"
      ? await paged("polar", "/v1/organizations", body.credential)
      : (await api("dodo", "/brands", body.credential)).items;
    if (!Array.isArray(accounts)) throw new Error("Provider organizations are unavailable");
    const candidates = accounts.map((a) => ({ id: provider === "polar" ? a.id : a.brand_id,
      name: a.name }));
    if (!candidates.length) throw new Error("No provider account is available to this key");
    const encrypted = await encrypt(body.credential);
    const saved = await service.from("app_verified_revenue_connections").upsert({
      owner_user_id: ownerId, provider, status: "active",
      access_token_ciphertext: encrypted.ciphertext, access_token_iv: encrypted.iv,
      refresh_token_ciphertext: null, refresh_token_iv: null,
      access_token_expires_at: null, last_successful_sync: null,
      last_error: null, updated_at: new Date().toISOString(),
    }, { onConflict: "owner_user_id,provider" }).select("id").single();
    if (saved.error || !saved.data) throw new Error("Provider connection could not be saved");
    const invalidated = await service.rpc("invalidate_app_verified_revenue_connection", {
      p_connection_id: saved.data.id, p_owner_user_id: ownerId,
    });
    if (invalidated.error) throw invalidated.error;
    return json({ connected: true, accounts: candidates });
  }
  if (!connection || connection.status === "disconnected") throw new Error("Connect provider first");
  if (body.action === "accounts") {
    const token = await decrypt(connection.access_token_ciphertext, connection.access_token_iv);
    const data = provider === "polar"
      ? await paged("polar", "/v1/organizations", token)
      : (await api("dodo", "/brands", token)).items;
    if (!Array.isArray(data)) throw new Error("Provider accounts are unavailable");
    return json({ accounts: data.map((a) => ({ id: provider === "polar" ? a.id : a.brand_id,
      name: a.name })) });
  }
  if (body.action === "preview" || body.action === "save_mapping") {
    if (typeof body.account_id !== "string" || body.account_id.length > 255)
      return json({ error: "Select a provider account" }, 400);
    const token = await decrypt(connection.access_token_ciphertext, connection.access_token_iv);
    const fresh = await providerSource(provider, token, body.account_id);
    if (body.action === "preview") return json({ account_id: fresh.accountId,
      account_name: fresh.accountName, products: fresh.products,
      metric_type: fresh.metricType, value_minor: fresh.valueMinor, currency: "USD",
      period_start: fresh.period.start, period_end: fresh.period.end });
    if (body.confirm_dedicated !== true) return json({ error: "Confirm this account is dedicated to this app" }, 400);
    const previous = await selection(appId);
    if (previous && previous !== provider && body.confirm_switch !== true)
      return json({ error: "Confirm the revenue provider switch" }, 400);
    const saved = await service.rpc("bind_app_verified_payment_source", {
      p_app_id: appId, p_user_id: ownerId, p_connection_id: connection.id,
      p_provider: provider, p_external_account_id: fresh.accountId,
      p_external_app_id: fresh.appId, p_product_ids: fresh.productIds,
      p_metric_type: fresh.metricType, p_value_minor: fresh.valueMinor,
      p_currency: "USD", p_period_start: fresh.period.start,
      p_period_end: fresh.period.end, p_expected_previous: previous,
      p_confirm_switch: body.confirm_switch === true,
    });
    if (saved.error) {
      if (saved.error.code === "23505") return json({ error: "This provider account is already mapped to another Rocket app" }, 409);
      throw saved.error;
    }
    return json({ saved: true, visibility: "private" });
  }
  if (!linked || linked.provider !== provider || linked.connection_id !== connection.id)
    throw new Error("Map a provider source first");
  if (body.action === "sync") return json({ sync: await sync(appId, ownerId, provider) });
  if (body.action === "set_visibility") {
    if (!["private", "verified_only", "range", "exact"].includes(String(body.visibility)))
      return json({ error: "Invalid visibility" }, 400);
    const updated = await service.from("app_verified_revenue_sources")
      .update({ visibility: body.visibility, updated_at: new Date().toISOString() })
      .eq("app_id", appId).eq("owner_user_id", ownerId).eq("connection_id", connection.id);
    if (updated.error) throw updated.error;
    await refreshProjection(appId);
    return json({ visibility: body.visibility });
  }
  if (body.action === "disconnect") {
    const result = await service.rpc("disconnect_app_verified_revenue", { p_app_id: appId, p_user_id: ownerId });
    if (result.error) throw result.error;
    return json({ ok: true, provider_side_revocation: false });
  }
  return json({ error: "Unknown action" }, 400);
}
Deno.serve(async (request) => {
  try { return await handle(request); }
  catch (error) {
    const message = error instanceof Error ? error.message : "Provider request failed";
    const status = message === "Sign in to continue" ? 401
      : message === "A domain-verified app owner is required" ? 403
      : message === "Revenue credential storage is unavailable" ? 503
      : /authorization failed|data is unavailable|Invalid provider response/.test(message) ? 502 : 400;
    return json({ error: message }, status);
  }
});
