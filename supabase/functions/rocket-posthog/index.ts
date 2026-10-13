import { createClient } from "npm:@supabase/supabase-js@2.101.1";

// PostHog is a separate traffic source. A connection never changes the active
// GA4 choice; a completed-day sync and an explicit owner switch are required.
const sbUrl = Deno.env.get("SUPABASE_URL")!;
const service = createClient(sbUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const auth = createClient(sbUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
const frontend = Deno.env.get("APP_URL") || "https://tryrocket.ai";
const clientIdFor = (region: string) => region === "eu"
  ? Deno.env.get("POSTHOG_EU_OAUTH_CLIENT_ID")
  : Deno.env.get("POSTHOG_OAUTH_CLIENT_ID");
const clientSecretFor = (region: string) => region === "eu"
  ? Deno.env.get("POSTHOG_EU_OAUTH_CLIENT_SECRET")
  : Deno.env.get("POSTHOG_OAUTH_CLIENT_SECRET");
const redirectUri = sbUrl + "/functions/v1/rocket-posthog";
const cors = { "Access-Control-Allow-Origin": frontend,
  "Access-Control-Allow-Headers": "authorization,apikey,content-type,x-client-info",
  "Access-Control-Allow-Methods": "POST,OPTIONS", "Cache-Control": "no-store" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, "Content-Type": "application/json" },
});
const fail = (message: string, status = 400) => json({ error: message }, status);
const validId = (value: unknown): value is string => typeof value === "string"
  && /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(value);
const base64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))
  .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
const fromBase64 = (value: string) => Uint8Array.from(
  atob(value.replace(/-/g, "+").replace(/_/g, "/")), (char) => char.charCodeAt(0));
const random = () => base64(crypto.getRandomValues(new Uint8Array(32)));
const hash = async (value: string) => base64(new Uint8Array(
  await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))));
const hostFor = (region: string) => region === "eu" ? "https://eu.posthog.com" : "https://us.posthog.com";
const safeRegion = (region: unknown) => region === "us" || region === "eu" ? region : null;

async function encryptionKey() {
  const raw = Deno.env.get("POSTHOG_TOKEN_ENCRYPTION_KEY");
  if (!raw || fromBase64(raw).length !== 32) throw new Error("PostHog encryption is not configured");
  return crypto.subtle.importKey("raw", fromBase64(raw), "AES-GCM", false, ["encrypt", "decrypt"]);
}
async function encrypt(value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv },
    await encryptionKey(), new TextEncoder().encode(value));
  return { refresh_token_ciphertext: base64(new Uint8Array(ciphertext)), refresh_token_iv: base64(iv) };
}
async function decrypt(row: Record<string, unknown>) {
  if (typeof row.refresh_token_ciphertext !== "string" || typeof row.refresh_token_iv !== "string")
    throw new Error("Reconnect PostHog");
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(row.refresh_token_iv) },
    await encryptionKey(), fromBase64(row.refresh_token_ciphertext));
  return new TextDecoder().decode(plain);
}
async function tokenRequest(region: string, body: URLSearchParams) {
  const clientId = clientIdFor(region);
  if (!clientId) throw new Error("PostHog OAuth is not configured");
  body.set("client_id", clientId);
  const clientSecret = clientSecretFor(region);
  if (clientSecret) body.set("client_secret", clientSecret);
  const response = await fetch(hostFor(region) + "/oauth/token/", { method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" }, body,
    signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error("PostHog authorization failed; reconnect");
  return await response.json() as Record<string, unknown>;
}
async function refreshedAccess(row: Record<string, unknown>) {
  const region = safeRegion(row.posthog_region);
  if (!region) throw new Error("Reconnect PostHog with a supported region");
  const tokens = await tokenRequest(region, new URLSearchParams({
    grant_type: "refresh_token", refresh_token: await decrypt(row),
  }));
  if (typeof tokens.access_token !== "string") throw new Error("Reconnect PostHog");
  if (typeof tokens.refresh_token === "string") {
    const saved = await service.from("app_data_connections").update({
      ...await encrypt(tokens.refresh_token), updated_at: new Date().toISOString(),
    }).eq("id", row.id);
    if (saved.error) throw saved.error;
  }
  return { token: tokens.access_token, scopedProjects: Array.isArray(tokens.scoped_teams)
    ? tokens.scoped_teams.map(String).filter((id) => /^\d{1,16}$/.test(id)) : [] };
}
async function accessToken(row: Record<string, unknown>) {
  return (await refreshedAccess(row)).token;
}
async function authorizedProjects(row: Record<string, unknown>) {
  // The OAuth consent limits access to a project. The collection endpoint can
  // reject project-scoped tokens, so use the token's server-issued project IDs
  // and retrieve only those projects individually.
  const { token, scopedProjects } = await refreshedAccess(row);
  if (!scopedProjects.length) throw new Error("PostHog project grant unavailable; reconnect");
  const region = safeRegion(row.posthog_region)!;
  const projects = await Promise.all(scopedProjects.map(async (id) => {
    const data = await posthog(region, "/api/projects/" + id + "/", token);
    return { id, name: String(data.name || id) };
  }));
  return { token, projects };
}
async function posthog(region: string, path: string, token: string, body?: unknown) {
  const response = await fetch(hostFor(region) + path, {
    method: body ? "POST" : "GET",
    headers: { Authorization: "Bearer " + token, ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    // Keep upstream details out of client responses and logs; status and route
    // are enough to distinguish a scoped-project endpoint from a token failure.
    console.error("rocket_posthog_upstream_failure", { path, status: response.status });
    throw new Error(response.status === 401 || response.status === 403
      ? "PostHog access was revoked or lacks read permission" : "PostHog query failed");
  }
  return await response.json() as Record<string, unknown>;
}
async function owner(appId: string, userId: string) {
  const owned = await service.from("app_owners").select("verification_level")
    .eq("app_id", appId).eq("user_id", userId).is("revoked_at", null).maybeSingle();
  if (owned.error || owned.data?.verification_level !== "domain_verified")
    throw new Error("A domain-verified app owner is required");
  const app = await service.from("public_apps").select("id,canonical_host").eq("id", appId).single();
  if (app.error || !app.data || !/^[a-z0-9.-]+$/i.test(app.data.canonical_host))
    throw new Error("The app needs a verified website host");
  return app.data;
}
async function connection(appId: string) {
  const row = await service.from("app_data_connections").select("*")
    .eq("app_id", appId).eq("provider", "posthog").maybeSingle();
  if (row.error) throw row.error;
  return row.data;
}
function safeConnection(row: Record<string, unknown> | null) {
  if (!row) return null;
  return { status: row.status, project_id: row.property_id, project_name: row.property_name,
    verified_hostname: row.verified_hostname, region: row.posthog_region,
    last_successful_sync: row.last_successful_sync, last_error: row.last_error };
}
function pageviewsQuery(host: string, period: "recent" | "completed") {
  // The owner-verified canonical host is restricted to DNS characters above.
  // A URL prefix plus a slash/question boundary excludes lookalike hosts.
  const url = "properties.$current_url";
  const hosts = "(" + url + " = 'https://" + host + "' OR " + url
    + " LIKE 'https://" + host + "/%' OR " + url + " LIKE 'https://" + host + "?%')";
  const utcToday = new Date().toISOString().slice(0, 10);
  const utcYesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const dates = period === "recent"
    ? "timestamp >= now() - INTERVAL 1 DAY"
    : "timestamp >= toDateTime('" + utcYesterday + " 00:00:00', 'UTC')"
      + " AND timestamp < toDateTime('" + utcToday + " 00:00:00', 'UTC')";
  return "SELECT count() AS pageviews FROM events WHERE event = '$pageview' AND "
    + dates + " AND " + hosts;
}
async function countPageviews(row: Record<string, unknown>, host: string, period: "recent" | "completed") {
  const region = safeRegion(row.posthog_region);
  if (!region || !/^\d{1,16}$/.test(String(row.property_id))) throw new Error("Select a PostHog project first");
  const token = await accessToken(row);
  const data = await posthog(region, "/api/projects/" + row.property_id + "/query/", token,
    { query: { kind: "HogQLQuery", query: pageviewsQuery(host, period) } });
  const count = (data.results as unknown[][] | undefined)?.[0]?.[0];
  if (count == null || !Number.isSafeInteger(Number(count)) || Number(count) < 0)
    throw new Error("PostHog did not return a complete pageview count");
  return Number(count);
}
async function sync(row: Record<string, unknown>) {
  const now = new Date().toISOString();
  try {
    const app = await owner(String(row.app_id), String(row.owner_user_id));
    if (app.canonical_host !== row.verified_hostname) throw new Error("Verified app host changed");
    const count = await countPageviews(row, app.canonical_host, "completed");
    const metricDate = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    const saved = await service.from("app_metric_points").upsert({
      app_id: row.app_id, connection_id: row.id, provider: "posthog", metric_type: "views",
      metric_date: metricDate, metric_value: count, property_id: row.property_id,
      verified_hostname: app.canonical_host, time_zone: "UTC",
      observed_through: now, verification_status: "verified", calculation_version: 1,
      updated_at: now,
    }, { onConflict: "connection_id,metric_type,metric_date" });
    if (saved.error) throw saved.error;
    // A zero day is valid after a previously verified day. It cannot be used
    // as the first proof of a project's mapping to this app.
    const complete = count > 0 || Boolean(row.last_successful_sync);
    const status = complete ? "active" : "select_property";
    const updated = await service.from("app_data_connections").update({
      status, last_attempted_sync: now, last_successful_sync: complete ? now : null,
      last_error: complete ? null : "No pageviews in the previous complete UTC day",
      updated_at: now,
    }).eq("id", row.id).neq("status", "disconnected");
    if (updated.error) throw updated.error;
    if (complete) {
      const projection = await service.rpc("refresh_app_traction_projection", { p_app_id: row.app_id });
      if (projection.error) throw projection.error;
    }
    return { metric: "PostHog pageviews", date: metricDate, count, complete };
  } catch (error) {
    // Failed refreshes must stop public display immediately and tell the owner
    // that the connection needs attention. Never return upstream token details.
    const message = error instanceof Error ? error.message : "PostHog sync failed";
    await service.from("app_data_connections").update({ status: "error",
      last_attempted_sync: now, last_error: message, updated_at: now,
    }).eq("id", row.id).neq("status", "disconnected");
    throw error;
  }
}
async function callback(request: Request) {
  const url = new URL(request.url);
  const state = url.searchParams.get("state"), code = url.searchParams.get("code");
  if (!state || !code || state.length > 256 || code.length > 4096) return fail("Invalid OAuth callback");
  const claimed = await service.rpc("consume_posthog_oauth_state", { p_state_hash: await hash(state) });
  const row = claimed.data?.[0];
  if (claimed.error || !row || !safeRegion(row.posthog_region))
    return fail("PostHog connection request expired or already used");
  try {
    await owner(row.app_id, row.user_id);
    const tokens = await tokenRequest(row.posthog_region, new URLSearchParams({
      grant_type: "authorization_code", code, redirect_uri: redirectUri, code_verifier: row.pkce_verifier,
    }));
    if (typeof tokens.refresh_token !== "string" || typeof tokens.access_token !== "string"
      || !String(tokens.scope || "").split(/\s+/).includes("query:read")
      || !String(tokens.scope || "").split(/\s+/).includes("project:read"))
      throw new Error("PostHog did not grant required read scopes");
    const stored = await service.rpc("replace_posthog_authorization", {
      p_app_id: row.app_id, p_user_id: row.user_id, p_region: row.posthog_region,
      p_token: await encrypt(tokens.refresh_token),
    });
    if (stored.error) throw stored.error;
    return Response.redirect(frontend + "/my-apps/" + encodeURIComponent(row.app_id) + "/analytics?posthog=connected", 303);
  } catch {
    return Response.redirect(frontend + "/my-apps/" + encodeURIComponent(row.app_id) + "/analytics?posthog=error", 303);
  }
}
async function handle(request: Request) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (request.method === "GET") return callback(request);
  if (request.method !== "POST") return fail("Method not allowed", 405);
  const body = await request.json() as Record<string, unknown>;
  if (body.action === "scheduled_sync") {
    const secret = Deno.env.get("POSTHOG_SYNC_SECRET");
    if (!secret || secret.length < 32 || request.headers.get("x-rocket-sync-secret") !== secret)
      return fail("Unauthorized", 401);
    const results: PromiseSettledResult<unknown>[] = [];
    // Page through every linked project; the old fixed 50-row cap silently
    // stopped syncing later owners as Rocket grew.
    let lastId: string | null = null;
    for (;;) {
      let query = service.from("app_data_connections").select("*")
        .eq("provider", "posthog").in("status", ["active", "select_property", "error"])
        .not("property_id", "is", null).order("id").limit(50);
      if (lastId) query = query.gt("id", lastId);
      const found = await query;
      if (found.error) throw found.error;
      const candidates = found.data || [];
      for (let index = 0; index < candidates.length; index += 5) {
        results.push(...await Promise.allSettled(candidates.slice(index, index + 5).map(sync)));
      }
      if (candidates.length < 50) break;
      lastId = candidates[candidates.length - 1].id;
    }
    return json({ attempted: results.length,
      succeeded: results.filter((result) => result.status === "fulfilled").length,
      failed: results.filter((result) => result.status === "rejected").length });
  }
  const token = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return fail("Sign in to continue", 401);
  const user = await auth.auth.getUser(token);
  if (user.error || !user.data.user || user.data.user.is_anonymous) return fail("Sign in to continue", 401);
  if (!validId(body.app_id)) return fail("Invalid app");
  const app = await owner(body.app_id, user.data.user.id);
  const row = await connection(app.id);
  if (body.action === "status") {
    const selection = await service.from("app_provider_selection").select("analytics_provider")
      .eq("app_id", app.id).maybeSingle();
    const visibility = await service.from("app_metric_visibility").select("visibility")
      .eq("app_id", app.id).eq("provider", "posthog").eq("metric_type", "views").maybeSingle();
    const latest = row ? await service.from("app_metric_points").select("metric_date,metric_value")
      .eq("connection_id", row.id).eq("metric_type", "views").order("metric_date", { ascending: false }).limit(1) : null;
    if (selection.error || visibility.error || latest?.error) throw new Error("PostHog status unavailable");
    return json({ connection: safeConnection(row), selected: selection.data?.analytics_provider === "posthog",
      active_provider: selection.data?.analytics_provider ?? null,
      visibility: visibility.data?.visibility ?? "private", latest: latest?.data?.[0] ?? null });
  }
  if (body.action === "start") {
    const region = safeRegion(body.region);
    if (!region) return fail("Select the PostHog US or EU region");
    const clientId = clientIdFor(region);
    if (!clientId) return fail("PostHog OAuth is not configured", 503);
    const state = random(), verifier = random();
    const saved = await service.from("app_data_oauth_states").insert({
      state_hash: await hash(state), app_id: app.id, user_id: user.data.user.id,
      provider: "posthog", posthog_region: region, pkce_verifier: verifier,
      expires_at: new Date(Date.now() + 600_000).toISOString(),
    });
    if (saved.error) throw saved.error;
    const url = new URL(hostFor(region) + "/oauth/authorize/");
    Object.entries({ response_type: "code", client_id: clientId, redirect_uri: redirectUri,
      scope: "query:read project:read", required_access_level: "project", state,
      code_challenge: await hash(verifier), code_challenge_method: "S256" })
      .forEach(([key, value]) => url.searchParams.set(key, value));
    return json({ authorization_url: url.toString() });
  }
  if (!row || row.status === "disconnected" || row.owner_user_id !== user.data.user.id)
    return fail("Connect PostHog first");
  if (body.action === "projects") {
    const { projects } = await authorizedProjects(row);
    return json({ projects });
  }
  if (body.action === "select_project") {
    if (row.property_id) return fail("Disconnect the existing project before choosing another");
    if (typeof body.project_id !== "string" || !/^\d{1,16}$/.test(body.project_id))
      return fail("Choose a valid PostHog project");
    const { projects } = await authorizedProjects(row);
    const project = projects.find((item) => item.id === body.project_id);
    if (!project) return fail("This project is not accessible", 403);
    // Listing projects may rotate the refresh token.
    const candidate = { ...await connection(app.id), property_id: body.project_id };
    const recent = await countPageviews(candidate, app.canonical_host, "recent");
    if (recent === 0) return fail("This project has no recent pageviews for the verified app host");
    const updated = await service.from("app_data_connections").update({
      property_id: body.project_id, property_name: String(project.name || body.project_id),
      stream_id: "$pageview:$current_url", verified_hostname: app.canonical_host,
      time_zone: "UTC", status: "select_property", last_successful_sync: null,
      last_error: null, updated_at: new Date().toISOString(),
    }).eq("id", row.id).select("*").single();
    if (updated.error) throw updated.error;
    return json({ recent_pageviews: recent, sync: await sync(updated.data) });
  }
  if (body.action === "retry_sync") return json({ sync: await sync(row) });
  if (body.action === "activate") {
    if (body.confirm_switch !== true || typeof body.expected_previous !== "string"
      && body.expected_previous !== null) return fail("Confirm the provider switch");
    const result = await service.rpc("activate_verified_posthog", {
      p_app_id: app.id, p_owner_user_id: user.data.user.id,
      p_expected_previous: body.expected_previous,
    });
    if (result.error) return fail(result.error.message, 409);
    return json({ selected: true, visibility: "private" });
  }
  if (body.action === "set_visibility") {
    if (!["private", "verified_only", "range", "exact"].includes(String(body.visibility)))
      return fail("Invalid visibility");
    const selected = await service.from("app_provider_selection").select("analytics_provider")
      .eq("app_id", app.id).eq("owner_user_id", user.data.user.id).maybeSingle();
    if (selected.error || selected.data?.analytics_provider !== "posthog" || row.status !== "active"
      || (body.visibility !== "private" && (!row.last_successful_sync
        || Date.now() - Date.parse(String(row.last_successful_sync)) >= 72 * 60 * 60 * 1000)))
      return fail("Select verified PostHog before publishing traffic");
    const saved = await service.from("app_metric_visibility").upsert({
      app_id: app.id, provider: "posthog", metric_type: "views",
      visibility: body.visibility, updated_at: new Date().toISOString(),
    }, { onConflict: "app_id,provider,metric_type" });
    if (saved.error) throw saved.error;
    const projected = await service.rpc("refresh_app_traction_projection", { p_app_id: app.id });
    if (projected.error) throw projected.error;
    return json({ visibility: body.visibility });
  }
  if (body.action === "disconnect") {
    const disconnected = await service.rpc("disconnect_posthog_authorization", {
      p_app_id: app.id, p_user_id: user.data.user.id,
    });
    if (disconnected.error) throw disconnected.error;
    return json({ disconnected: true });
  }
  return fail("Unknown action");
}
Deno.serve(async (request) => {
  try { return await handle(request); }
  catch (error) { console.error("rocket_posthog_error", error instanceof Error ? error.message : "unknown");
    return fail(error instanceof Error ? error.message : "PostHog request failed", 503); }
});
