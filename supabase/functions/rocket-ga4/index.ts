import { createClient } from "npm:@supabase/supabase-js@2.101.1";
import { GA4_SCOPE, VISIBILITIES, completeDateWindow, completePeriodGrowth, dailyMetricPoints, matchingStreamHost } from "../_shared/ga4Traffic.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const service = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const auth = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
const frontend = Deno.env.get("GA4_FRONTEND_ORIGIN") || "https://tryrocket.ai";
const clientId = Deno.env.get("GOOGLE_GA4_CLIENT_ID");
const clientSecret = Deno.env.get("GOOGLE_GA4_CLIENT_SECRET");
const redirectUri = `${supabaseUrl}/functions/v1/rocket-ga4`;
const cors = { "Access-Control-Allow-Origin": frontend, "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });
const fail = (message: string, status = 400) => json({ error: message }, status);
const uuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
const unb64 = (value: string) => Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")), (char) => char.charCodeAt(0));
const random = () => b64(crypto.getRandomValues(new Uint8Array(32)));
async function sha256(value: string) { return b64(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))); }

async function encryptionKey() {
  const encoded = Deno.env.get("GA4_TOKEN_ENCRYPTION_KEY");
  if (!encoded) throw new Error("GA4 encryption is not configured");
  const raw = unb64(encoded);
  if (raw.length !== 32) throw new Error("GA4 encryption key must contain 32 bytes");
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}
async function encryptToken(token: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await encryptionKey(), new TextEncoder().encode(token));
  return { refresh_token_ciphertext: b64(new Uint8Array(cipher)), refresh_token_iv: b64(iv) };
}
async function decryptToken(row: Record<string, unknown>) {
  if (typeof row.refresh_token_ciphertext !== "string" || typeof row.refresh_token_iv !== "string") throw new Error("Reconnect Google Analytics");
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(row.refresh_token_iv) }, await encryptionKey(), unb64(row.refresh_token_ciphertext));
  return new TextDecoder().decode(plain);
}

async function currentUser(req: Request) {
  const token = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) throw new Error("Sign in to continue");
  const { data, error } = await auth.auth.getUser(token);
  if (error || !data.user || data.user.is_anonymous) throw new Error("Sign in to continue");
  return data.user.id;
}
async function ownedApp(appId: string, userId: string) {
  const { data, error } = await service.from("app_owners").select("app_id,verification_level")
    .eq("app_id", appId).eq("user_id", userId).is("revoked_at", null).maybeSingle();
  if (error || !data || data.verification_level !== "domain_verified") throw new Error("A domain-verified app owner is required");
  const app = await service.from("public_apps").select("id,canonical_host").eq("id", appId).single();
  if (app.error || !app.data) throw new Error("App is not available");
  return app.data;
}
async function connection(appId: string) {
  const { data, error } = await service.from("app_data_connections").select("*").eq("app_id", appId).eq("provider", "ga4").maybeSingle();
  if (error) throw error;
  return data;
}
function safeConnection(row: Record<string, unknown> | null) {
  if (!row) return null;
  return { status: row.status, property_name: row.property_name, verified_hostname: row.verified_hostname,
    last_attempted_sync: row.last_attempted_sync, last_successful_sync: row.last_successful_sync, last_error: row.last_error };
}
async function tokenRequest(body: URLSearchParams) {
  if (!clientId || !clientSecret) throw new Error("Google Analytics connection is not configured");
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" }, body, signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error("Google authorization failed; reconnect Google Analytics");
  return await response.json();
}
async function accessToken(row: Record<string, unknown>) {
  const refresh = await decryptToken(row);
  const tokens = await tokenRequest(new URLSearchParams({ client_id: clientId!, client_secret: clientSecret!,
    refresh_token: refresh, grant_type: "refresh_token" }));
  if (typeof tokens.access_token !== "string") throw new Error("Google did not provide access");
  return tokens.access_token as string;
}
async function readGoogle(url: string, init: RequestInit, timeoutMs = 15_000) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    if (![429, 502, 503, 504].includes(response.status) || attempt === 2) return response;
    await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
  }
  throw new Error("Google Analytics request failed");
}
async function googleGet(url: string, token: string) {
  const response = await readGoogle(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(response.status === 403 ? "Google Analytics access is unavailable" : "Could not read Google Analytics property");
  return await response.json();
}
async function properties(token: string) {
  const result: Array<{ id: string; name: string }> = [];
  let page = "";
  for (let count = 0; count < 10; count++) {
    const url = new URL("https://analyticsadmin.googleapis.com/v1beta/accountSummaries");
    url.searchParams.set("pageSize", "200");
    if (page) url.searchParams.set("pageToken", page);
    const data = await googleGet(url.toString(), token);
    for (const account of data.accountSummaries || []) for (const property of account.propertySummaries || []) {
      if (/^properties\/\d+$/.test(property.property)) result.push({ id: property.property, name: property.displayName || property.property });
    }
    if (!data.nextPageToken) return result;
    page = data.nextPageToken;
  }
  throw new Error("Too many Google Analytics properties to list safely");
}
async function streams(property: string, token: string) {
  const data = await googleGet(`https://analyticsadmin.googleapis.com/v1alpha/${property}/dataStreams?pageSize=200`, token);
  if (data.nextPageToken) throw new Error("Too many data streams to validate safely");
  return (data.dataStreams || []).filter((stream: Record<string, unknown>) =>
    typeof stream.name === "string" && stream.type === "WEB_DATA_STREAM" && typeof (stream.webStreamData as Record<string, unknown> | undefined)?.defaultUri === "string") as Array<{ name: string; displayName: string; webStreamData: { defaultUri: string } }>;
}
async function project(appId: string) {
  const { error } = await service.rpc("refresh_app_traction_projection", { p_app_id: appId });
  if (error) throw error;
}
async function sync(row: Record<string, unknown>, backfill: boolean) {
  const appId = String(row.app_id);
  const id = String(row.id);
  const attempted = new Date().toISOString();
  await service.from("app_data_connections").update({ last_attempted_sync: attempted }).eq("id", id);
  try {
    const app = await ownedApp(appId, String(row.owner_user_id));
    if (typeof row.property_id !== "string" || typeof row.verified_hostname !== "string" || typeof row.time_zone !== "string") throw new Error("Select a Google Analytics property first");
    const token = await accessToken(row);
    // Revalidate access and the selected stream; a changed stream must not remain verified.
    const available = await streams(row.property_id, token);
    const selected = available.find((stream) => stream.name === row.stream_id);
    if (!selected || !matchingStreamHost(app.canonical_host, selected.webStreamData.defaultUri)
      || new URL(selected.webStreamData.defaultUri).hostname.toLowerCase() !== String(row.verified_hostname).toLowerCase())
      throw new Error("The selected website stream changed; reconnect to verify it");
    const window = completeDateWindow(row.time_zone, backfill ? 90 : 3);
    const response = await readGoogle(`https://analyticsdata.googleapis.com/v1beta/${row.property_id}:runReport`, {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ dateRanges: [{ startDate: window.start, endDate: window.end }], dimensions: [{ name: "date" }],
        metrics: [{ name: "activeUsers" }, { name: "sessions" }, { name: "screenPageViews" }],
        dimensionFilter: { filter: { fieldName: "hostName", stringFilter: { matchType: "EXACT", value: row.verified_hostname, caseSensitive: false } } },
        limit: "1000" }),
    }, 30_000);
    if (!response.ok) throw new Error("Google Analytics report failed");
    const report = await response.json();
    if (report.metadata?.subjectToThresholding) throw new Error("Google Analytics thresholded this report; it cannot be verified");
    if (Number(report.rowCount || 0) > 1000) throw new Error("Google Analytics report was truncated");
    const now = new Date().toISOString();
    const points = dailyMetricPoints(report.rows || [], window.start, window.end).map((point) => ({
      ...point, app_id: appId, connection_id: id, provider: "ga4", property_id: row.property_id,
      verified_hostname: row.verified_hostname, time_zone: row.time_zone, observed_through: now,
      verification_status: "verified", calculation_version: 1, updated_at: now,
    }));
    const saved = await service.from("app_metric_points").upsert(points, { onConflict: "connection_id,metric_type,metric_date" });
    if (saved.error) throw saved.error;
    const updated = await service.from("app_data_connections").update({ status: "active", last_successful_sync: now,
      last_error: null, updated_at: now }).eq("id", id);
    if (updated.error) throw updated.error;
    await project(appId);
    return { days: points.length / 3, points: points.length };
  } catch (error) {
    const message = (error as Error).message.slice(0, 160);
    const ownerLost = message === "A domain-verified app owner is required";
    await service.from("app_data_connections").update({ status: ownerLost ? "disconnected" : "error",
      ...(ownerLost ? { refresh_token_ciphertext: null, refresh_token_iv: null } : {}),
      last_error: message, updated_at: new Date().toISOString() }).eq("id", id);
    await project(appId);
    throw error;
  }
}

async function callback(request: Request) {
  const url = new URL(request.url);
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  if (!state || !code || state.length > 256 || code.length > 4096) return new Response("Invalid authorization response", { status: 400 });
  const claimed = await service.rpc("consume_app_data_oauth_state", { p_state_hash: await sha256(state) });
  const row = claimed.data?.[0];
  if (claimed.error || !row) return new Response("Connection request expired or already used", { status: 400 });
  try {
    await ownedApp(row.app_id, row.user_id);
    const tokens = await tokenRequest(new URLSearchParams({ code, client_id: clientId!, client_secret: clientSecret!,
      redirect_uri: redirectUri, code_verifier: row.pkce_verifier, grant_type: "authorization_code" }));
    if (typeof tokens.refresh_token !== "string" || !String(tokens.scope || "").split(" ").includes(GA4_SCOPE))
      throw new Error("Google did not grant offline read-only Analytics access");
    const encrypted = await encryptToken(tokens.refresh_token);
    const existing = await connection(row.app_id);
    const stored = await service.from("app_data_connections").upsert({ app_id: row.app_id, owner_user_id: row.user_id,
      provider: "ga4", status: "select_property", property_id: null, property_name: null, stream_id: null,
      verified_hostname: null, time_zone: null, last_error: null, last_successful_sync: null,
      ...encrypted, updated_at: new Date().toISOString(), ...(existing ? { id: existing.id } : {}) },
    { onConflict: "app_id,provider" });
    if (stored.error) throw stored.error;
    await project(row.app_id);
    return Response.redirect(`${frontend}/my-apps/${encodeURIComponent(row.app_id)}/analytics`, 303);
  } catch {
    return Response.redirect(`${frontend}/my-apps/${encodeURIComponent(row.app_id)}/analytics?ga4=error`, 303);
  }
}

async function handle(request: Request) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (request.method === "GET") return callback(request);
  if (request.method !== "POST") return fail("Method not allowed", 405);
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return fail("Invalid request"); }
  if (body.action === "scheduled_sync") {
    const configured = Deno.env.get("GA4_SYNC_SECRET");
    if (!configured || configured.length < 32 || request.headers.get("x-rocket-sync-secret") !== configured) return fail("Unauthorized", 401);
    const found = await service.from("app_data_connections").select("*").in("status", ["active", "error"])
      .order("last_attempted_sync", { ascending: true, nullsFirst: true }).limit(50);
    if (found.error) throw found.error;
    let succeeded = 0, failed = 0;
    for (let start = 0; start < (found.data || []).length; start += 5) {
      const results = await Promise.allSettled((found.data || []).slice(start, start + 5).map((row) => sync(row, false)));
      for (const result of results) {
        if (result.status === "fulfilled") succeeded++;
        else failed++;
      }
    }
    return json({ attempted: (found.data || []).length, succeeded, failed }, failed ? 503 : 200);
  }
  const userId = await currentUser(request);
  if (!uuid(body.app_id)) return fail("Invalid app");
  const app = await ownedApp(body.app_id, userId);
  const row = await connection(app.id);
  if (body.action === "status") {
    const vis = await service.from("app_metric_visibility").select("metric_type,visibility").eq("app_id", app.id);
    if (vis.error) throw vis.error;
    let latest: Array<{ metric_type: string; metric_date: string; metric_value: number }> = [];
    let growth: Record<string, { seven_day: number | null; thirty_day: number | null }> = {};
    if (row?.status === "active" && typeof row.time_zone === "string") {
      const newest = await service.from("app_metric_points").select("metric_type,metric_date,metric_value")
        .eq("connection_id", row.id).order("metric_date", { ascending: false }).limit(3);
      if (newest.error) throw newest.error;
      latest = newest.data || [];
      const points = await service.from("app_metric_points").select("metric_type,metric_date,metric_value")
        .eq("connection_id", row.id).in("metric_type", ["sessions", "views"])
        .order("metric_date", { ascending: false }).limit(120);
      if (points.error) throw points.error;
      const end = completeDateWindow(row.time_zone, 1).end;
      growth = Object.fromEntries(["sessions", "views"].map((metric) => {
        const series = (points.data || []).filter((point) => point.metric_type === metric);
        return [metric, { seven_day: completePeriodGrowth(series, end, 7),
          thirty_day: completePeriodGrowth(series, end, 30) }];
      }));
    }
    return json({ connection: safeConnection(row), visibility: vis.data, latest, growth });
  }
  if (body.action === "start") {
    if (!clientId || !clientSecret) return fail("Google Analytics connection is not configured", 503);
    const state = random(), verifier = random();
    const saved = await service.from("app_data_oauth_states").insert({ state_hash: await sha256(state), app_id: app.id,
      user_id: userId, pkce_verifier: verifier, expires_at: new Date(Date.now() + 10 * 60_000).toISOString() });
    if (saved.error) throw saved.error;
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    Object.entries({ client_id: clientId, redirect_uri: redirectUri, response_type: "code", scope: GA4_SCOPE,
      access_type: "offline", prompt: "consent", state, code_challenge: await sha256(verifier), code_challenge_method: "S256" })
      .forEach(([key, value]) => url.searchParams.set(key, value));
    return json({ authorization_url: url.toString() });
  }
  if (!row || row.status === "disconnected") return fail("Connect Google Analytics first");
  if (body.action === "properties") {
    const token = await accessToken(row);
    return json({ properties: await properties(token) });
  }
  if (body.action === "streams") {
    if (typeof body.property_id !== "string" || !/^properties\/\d+$/.test(body.property_id)) return fail("Invalid property");
    const token = await accessToken(row);
    const accessible = await properties(token);
    if (!accessible.some((item) => item.id === body.property_id)) return fail("Property is not accessible", 403);
    const data = await streams(body.property_id, token);
    return json({ streams: data.map((item) => ({ id: item.name, name: item.displayName,
      hostname: (() => { try { return new URL(item.webStreamData.defaultUri).hostname; } catch { return null; } })(),
      matches_app: matchingStreamHost(app.canonical_host, item.webStreamData.defaultUri) })) });
  }
  if (body.action === "select_property") {
    if (typeof body.property_id !== "string" || !/^properties\/\d+$/.test(body.property_id)
      || typeof body.stream_id !== "string" || !/^properties\/\d+\/dataStreams\/\d+$/.test(body.stream_id)
      || !body.stream_id.startsWith(`${body.property_id}/`)) return fail("Invalid property or stream");
    const token = await accessToken(row);
    const accessible = await properties(token);
    const property = accessible.find((item) => item.id === body.property_id);
    if (!property) return fail("Property is not accessible", 403);
    const stream = (await streams(property.id, token)).find((item) => item.name === body.stream_id);
    if (!stream || !matchingStreamHost(app.canonical_host, stream.webStreamData.defaultUri))
      return fail("This web stream does not match the app's verified domain");
    const details = await googleGet(`https://analyticsadmin.googleapis.com/v1beta/${property.id}`, token);
    if (typeof details.timeZone !== "string") return fail("Google Analytics property has no valid time zone");
    const updated = await service.from("app_data_connections").update({ property_id: property.id,
      property_name: property.name, stream_id: stream.name, verified_hostname: new URL(stream.webStreamData.defaultUri).hostname.toLowerCase(),
      time_zone: details.timeZone, status: "select_property", updated_at: new Date().toISOString() }).eq("id", row.id).select("*").single();
    if (updated.error) throw updated.error;
    await project(app.id);
    return json({ sync: await sync(updated.data, true), connection: safeConnection({ ...updated.data, status: "active" }) });
  }
  if (body.action === "retry_sync") return json({ sync: await sync(row, !row.last_successful_sync) });
  if (body.action === "set_visibility") {
    if (typeof body.metric_type !== "string" || !["active_users", "sessions", "views"].includes(body.metric_type)
      || typeof body.visibility !== "string" || !VISIBILITIES.includes(body.visibility as typeof VISIBILITIES[number])) return fail("Invalid visibility");
    const saved = await service.from("app_metric_visibility").upsert({ app_id: app.id,
      metric_type: body.metric_type, visibility: body.visibility, updated_at: new Date().toISOString() },
    { onConflict: "app_id,metric_type" });
    if (saved.error) throw saved.error;
    await project(app.id);
    return json({ ok: true });
  }
  if (body.action === "disconnect") {
    // Do not fail closedown if Google already revoked the grant.
    try { const token = await decryptToken(row); await fetch("https://oauth2.googleapis.com/revoke", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }) }); } catch { /* local deletion still takes precedence */ }
    const updated = await service.from("app_data_connections").update({ status: "disconnected",
      refresh_token_ciphertext: null, refresh_token_iv: null, last_error: null,
      updated_at: new Date().toISOString() }).eq("id", row.id);
    if (updated.error) throw updated.error;
    await project(app.id);
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
    // Never return provider errors, authorization codes, or tokens to the browser.
    if (message.startsWith("Google") || message.startsWith("Could not") || message.startsWith("Reconnect") || message.startsWith("The selected")) return fail(message, 502);
    return fail("Google Analytics request failed", 500);
  }
});
