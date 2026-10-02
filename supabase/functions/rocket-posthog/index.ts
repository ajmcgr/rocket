import { createClient } from "npm:@supabase/supabase-js@2.101.1";
import { completeDateWindow, VISIBILITIES } from "../_shared/ga4Traffic.ts";
import {
  posthogOrigin,
  posthogPoints,
  POSTHOG_SCOPES,
  trafficQuery,
} from "../_shared/posthogTraffic.ts";

const base = Deno.env.get("SUPABASE_URL")!;
const db = createClient(base, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const auth = createClient(base, Deno.env.get("SUPABASE_ANON_KEY")!);
const frontend = "https://tryrocket.ai";
const clientId = `${frontend}/posthog-client.json`;
const redirectUri = `${base}/functions/v1/rocket-posthog`;
const cors = {
  "Access-Control-Allow-Origin": frontend,
  "Access-Control-Allow-Headers":
    "authorization,apikey,content-type,x-client-info",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      ...cors,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
const b64 = (v: Uint8Array) =>
  btoa(String.fromCharCode(...v))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
const bytes = (v: string) =>
  Uint8Array.from(atob(v.replace(/-/g, "+").replace(/_/g, "/")), (c) =>
    c.charCodeAt(0),
  );
const random = () => b64(crypto.getRandomValues(new Uint8Array(32)));
const hash = async (v: string) =>
  b64(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v)),
    ),
  );
type Connection = Record<string, any>;
async function key() {
  const raw = bytes(
    Deno.env.get("POSTHOG_TOKEN_ENCRYPTION_KEY") ||
      Deno.env.get("GA4_TOKEN_ENCRYPTION_KEY") ||
      "",
  );
  if (raw.length !== 32)
    throw new Error("PostHog connection is not configured");
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}
async function encrypt(token: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const result = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await key(),
    new TextEncoder().encode(token),
  );
  return {
    refresh_token_ciphertext: b64(new Uint8Array(result)),
    refresh_token_iv: b64(iv),
  };
}
async function decrypt(row: Connection) {
  return new TextDecoder().decode(
    await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: bytes(row.refresh_token_iv) },
      await key(),
      bytes(row.refresh_token_ciphertext),
    ),
  );
}
async function owner(appId: string, userId: string) {
  const result = await db
    .from("app_owners")
    .select("app_id")
    .eq("app_id", appId)
    .eq("user_id", userId)
    .eq("verification_level", "domain_verified")
    .is("revoked_at", null)
    .maybeSingle();
  if (result.error || !result.data)
    throw new Error("A domain-verified app owner is required");
  const app = await db
    .from("public_apps")
    .select("id,canonical_host")
    .eq("id", appId)
    .single();
  if (app.error || !app.data) throw new Error("App is not available");
  return app.data;
}
async function connection(appId: string) {
  const r = await db
    .from("app_data_connections")
    .select("*")
    .eq("app_id", appId)
    .eq("provider", "posthog")
    .maybeSingle();
  if (r.error) throw r.error;
  return r.data as Connection | null;
}
async function project(appId: string) {
  const r = await db.rpc("refresh_app_traction_projection", {
    p_app_id: appId,
  });
  if (r.error) throw r.error;
}
async function tokenRequest(region: string, body: URLSearchParams) {
  body.set("client_id", clientId);
  const r = await fetch(`${posthogOrigin(region)}/oauth/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok)
    throw new Error("PostHog authorization expired; reconnect PostHog");
  const tokens = await r.json();
  if (
    typeof tokens.access_token !== "string" ||
    typeof tokens.refresh_token !== "string"
  )
    throw new Error("PostHog did not grant offline access");
  return tokens;
}
async function access(row: Connection) {
  const tokens = await tokenRequest(
    row.posthog_region,
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: await decrypt(row),
    }),
  );
  const r = await db
    .from("app_data_connections")
    .update(await encrypt(tokens.refresh_token))
    .eq("id", row.id)
    .eq("owner_user_id", row.owner_user_id)
    .eq("refresh_token_ciphertext", row.refresh_token_ciphertext)
    .neq("status", "disconnected")
    .select("id")
    .single();
  if (r.error) throw new Error("PostHog connection changed; reconnect PostHog");
  return tokens.access_token as string;
}
async function api(
  row: Connection,
  token: string,
  path: string,
  body?: unknown,
) {
  const r = await fetch(
    `${posthogOrigin(row.posthog_region)}/api/projects/${row.property_id}/${path}`,
    {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(30000),
      redirect: "error",
    },
  );
  if (!r.ok)
    throw new Error(
      r.status === 429
        ? "PostHog rate limit reached; try again later"
        : "PostHog project access or endpoint request failed",
    );
  return r.json();
}
// Serialize refresh-token rotation and sync operations. An abandoned lease expires.
async function locked<T>(
  row: Connection,
  work: (fresh: Connection) => Promise<T>,
) {
  const until = new Date(Date.now() + 180000).toISOString();
  const r = await db
    .from("app_data_connections")
    .update({ sync_locked_until: until })
    .eq("id", row.id)
    .neq("status", "disconnected")
    .or(
      `sync_locked_until.is.null,sync_locked_until.lt.${new Date().toISOString()}`,
    )
    .select("*")
    .maybeSingle();
  if (r.error || !r.data)
    throw new Error("PostHog connection is busy; try again shortly");
  try {
    return await work(r.data);
  } finally {
    await db
      .from("app_data_connections")
      .update({ sync_locked_until: null })
      .eq("id", row.id)
      .eq("sync_locked_until", until);
  }
}
async function sync(row: Connection, token: string) {
  const app = await owner(row.app_id, row.owner_user_id);
  const query = trafficQuery(app.canonical_host);
  await db
    .from("app_data_connections")
    .update({ last_attempted_sync: new Date().toISOString() })
    .eq("id", row.id);
  try {
    if (
      !row.property_id ||
      !row.stream_id ||
      row.verified_hostname !== app.canonical_host
    )
      throw new Error("PostHog domain connection changed; reconnect PostHog");
    const endpoint = await api(row, token, `endpoints/${row.stream_id}/`);
    if (
      endpoint.query?.kind !== "HogQLQuery" ||
      endpoint.query?.query !== query ||
      !endpoint.is_active ||
      !Number.isInteger(endpoint.current_version)
    )
      throw new Error("PostHog traffic endpoint changed; reconnect PostHog");
    const result = await api(row, token, `endpoints/${row.stream_id}/run/`, {
      version: endpoint.current_version,
      limit: 90,
      refresh: "cache",
    });
    const window = completeDateWindow("UTC", 90);
    const points = posthogPoints(result, window.start, window.end);
    if (!points.some((p) => p.metric_type === "views" && p.metric_value > 0))
      throw new Error(
        "PostHog has no pageviews for this app domain in the last 90 complete days",
      );
    const now = new Date().toISOString();
    await owner(row.app_id, row.owner_user_id);
    const saved = await db.from("app_metric_points").upsert(
      points.map((p) => ({
        ...p,
        app_id: row.app_id,
        connection_id: row.id,
        provider: "posthog",
        property_id: row.property_id,
        verified_hostname: app.canonical_host,
        time_zone: "UTC",
        observed_through: now,
        verification_status: "verified",
        calculation_version: 1,
        updated_at: now,
      })),
      { onConflict: "connection_id,metric_type,metric_date" },
    );
    if (saved.error) throw saved.error;
    const updated = await db
      .from("app_data_connections")
      .update({
        status: "active",
        last_successful_sync: now,
        last_error: null,
        updated_at: now,
      })
      .eq("id", row.id)
      .eq("owner_user_id", row.owner_user_id)
      .neq("status", "disconnected")
      .select("id")
      .single();
    if (updated.error) throw updated.error;
    await project(row.app_id);
    return { days: 90 };
  } catch (cause) {
    await db
      .from("app_data_connections")
      .update({
        status: "error",
        last_error:
          "Traffic sync failed. Check project access, domain pageviews and the Rocket endpoint.",
      })
      .eq("id", row.id)
      .neq("status", "disconnected");
    await project(row.app_id);
    throw cause;
  }
}
async function callback(req: Request) {
  const url = new URL(req.url),
    state = url.searchParams.get("state"),
    code = url.searchParams.get("code");
  if (!state || state.length > 256)
    return json({ error: "Invalid authorization state" }, 400);
  const claimed = await db.rpc("consume_posthog_oauth_state", {
      p_state_hash: await hash(state),
    }),
    row = claimed.data?.[0];
  if (claimed.error || !row)
    return json({ error: "Connection request expired or already used" }, 400);
  try {
    if (!code || code.length > 4096 || url.searchParams.has("error"))
      throw new Error("Authorization declined");
    await owner(row.app_id, row.user_id);
    const tokens = await tokenRequest(
      row.posthog_region,
      new URLSearchParams({
        grant_type: "authorization_code",
        code,
        code_verifier: row.pkce_verifier,
        redirect_uri: redirectUri,
      }),
    );
    if (
      !POSTHOG_SCOPES.every((s) =>
        String(tokens.scope || "")
          .split(" ")
          .includes(s),
      )
    )
      throw new Error("Missing PostHog permissions");
    await owner(row.app_id, row.user_id);
    const encrypted = await encrypt(tokens.refresh_token);
    const stored = await db.rpc("store_posthog_grant", {
      p_app_id: row.app_id,
      p_user_id: row.user_id,
      p_region: row.posthog_region,
      p_ciphertext: encrypted.refresh_token_ciphertext,
      p_iv: encrypted.refresh_token_iv,
    });
    if (stored.error) throw stored.error;
    await project(row.app_id);
    return Response.redirect(
      `${frontend}/my-apps/${row.app_id}/analytics?posthog=connected`,
      303,
    );
  } catch {
    return Response.redirect(
      `${frontend}/my-apps/${row.app_id}/analytics?posthog=error`,
      303,
    );
  }
}
async function handle(req: Request) {
  if (req.method === "OPTIONS")
    return new Response(null, { status: 204, headers: cors });
  if (req.method === "GET") return callback(req);
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const body = await req.json();
  if (body.action === "scheduled_sync") {
    const secret = Deno.env.get("ROCKET_GA4_SYNC_SECRET");
    if (
      !secret ||
      secret.length < 32 ||
      req.headers.get("x-rocket-sync-secret") !== secret
    )
      return json({ error: "Unauthorized" }, 401);
    const found = await db
      .from("app_data_connections")
      .select("*")
      .eq("provider", "posthog")
      .in("status", ["active", "error"])
      .not("stream_id", "is", null)
      .order("last_attempted_sync", { ascending: true, nullsFirst: true })
      .limit(5);
    if (found.error) throw found.error;
    let succeeded = 0,
      failed = 0;
    await Promise.all(
      (found.data || []).map(async (row) => {
        try {
          await db
            .from("app_data_connections")
            .update({ last_attempted_sync: new Date().toISOString() })
            .eq("id", row.id);
          await locked(row, async (fresh) => sync(fresh, await access(fresh)));
          succeeded++;
        } catch {
          failed++;
        }
      }),
    );
    return json({ succeeded, failed }, failed ? 503 : 200);
  }
  const bearer = req.headers
    .get("authorization")
    ?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!bearer) return json({ error: "Sign in to continue" }, 401);
  const user = await auth.auth.getUser(bearer);
  if (user.error || !user.data.user || user.data.user.is_anonymous)
    return json({ error: "Sign in to continue" }, 401);
  if (typeof body.app_id !== "string" || !/^[0-9a-f-]{36}$/i.test(body.app_id))
    return json({ error: "Invalid app" }, 400);
  const app = await owner(body.app_id, user.data.user.id),
    row = await connection(app.id);
  if (body.action === "status") {
    const vis = await db
      .from("app_metric_visibility")
      .select("metric_type,visibility")
      .eq("app_id", app.id)
      .eq("provider", "posthog");
    const latest = row
      ? await db
          .from("app_metric_points")
          .select("metric_type,metric_date,metric_value")
          .eq("connection_id", row.id)
          .order("metric_date", { ascending: false })
          .limit(3)
      : { data: [], error: null };
    if (vis.error || latest.error) throw vis.error || latest.error;
    return json({
      connection: row
        ? {
            status: row.status,
            property_name: row.property_name,
            verified_hostname: row.verified_hostname,
            last_successful_sync: row.last_successful_sync,
            last_error: row.last_error,
            region: row.posthog_region,
          }
        : null,
      visibility: vis.data,
      latest: latest.data,
    });
  }
  if (body.action === "start") {
    await key();
    const origin = posthogOrigin(body.region),
      state = random(),
      verifier = random();
    const saved = await db.from("app_data_oauth_states").insert({
      state_hash: await hash(state),
      app_id: app.id,
      user_id: user.data.user.id,
      provider: "posthog",
      posthog_region: body.region,
      pkce_verifier: verifier,
      expires_at: new Date(Date.now() + 600000).toISOString(),
    });
    if (saved.error) throw saved.error;
    const url = new URL(`${origin}/oauth/authorize/`);
    Object.entries({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: POSTHOG_SCOPES.join(" "),
      state,
      code_challenge: await hash(verifier),
      code_challenge_method: "S256",
    }).forEach(([k, v]) => url.searchParams.set(k, v));
    return json({ authorization_url: url.toString() });
  }
  if (!row || row.status === "disconnected")
    return json({ error: "Connect PostHog first" }, 400);
  if (body.action === "set_visibility") {
    if (
      !["active_users", "sessions", "views"].includes(body.metric_type) ||
      !VISIBILITIES.includes(body.visibility)
    )
      return json({ error: "Invalid visibility" }, 400);
    if (row.status !== "active" && body.visibility !== "private")
      return json({ error: "Sync traffic before publishing" }, 400);
    const saved = await db.from("app_metric_visibility").upsert(
      {
        app_id: app.id,
        provider: "posthog",
        metric_type: body.metric_type,
        visibility: body.visibility,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "app_id,provider,metric_type" },
    );
    if (saved.error) throw saved.error;
    await project(app.id);
    return json({ ok: true });
  }
  return locked(row, async (fresh) => {
    if (body.action === "disconnect") {
      try {
        await fetch(`${posthogOrigin(fresh.posthog_region)}/oauth/revoke/`, {
          method: "POST",
          body: new URLSearchParams({
            token: await decrypt(fresh),
            client_id: clientId,
          }),
          signal: AbortSignal.timeout(10000),
        });
      } catch {
        /* Local revocation takes precedence. */
      }
      const r = await db
        .from("app_data_connections")
        .update({
          status: "disconnected",
          refresh_token_ciphertext: null,
          refresh_token_iv: null,
          last_error: null,
        })
        .eq("id", fresh.id);
      if (r.error) throw r.error;
      await project(app.id);
      return json({ ok: true });
    }
    const token = await access(fresh);
    if (body.action === "select_project") {
      if (
        typeof body.project_id !== "string" ||
        !/^\d{1,12}$/.test(body.project_id)
      )
        return json({ error: "Enter a valid PostHog project ID" }, 400);
      fresh.property_id = body.project_id;
      const details = await api(fresh, token, "");
      const name = `rocket-traffic-${app.id}`;
      const query = trafficQuery(app.canonical_host);
      // This deterministic name is dedicated to this app; never modify another endpoint.
      let endpoint;
      try {
        endpoint = await api(fresh, token, `endpoints/${name}/`);
      } catch {
        endpoint = await api(fresh, token, "endpoints/", {
          name,
          description: `Rocket daily traffic for ${app.canonical_host}; no visitor-level data`,
          query: { kind: "HogQLQuery", query },
          data_freshness_seconds: 3600,
          is_materialized: false,
        });
      }
      if (
        endpoint.query?.query !== query ||
        endpoint.query?.kind !== "HogQLQuery" ||
        !endpoint.is_active
      )
        throw new Error("PostHog traffic endpoint changed; reconnect PostHog");
      const updated = await db
        .from("app_data_connections")
        .update({
          property_id: body.project_id,
          property_name: String(details.name || body.project_id).slice(0, 200),
          stream_id: name,
          verified_hostname: app.canonical_host,
          time_zone: "UTC",
          status: "select_property",
          last_successful_sync: null,
        })
        .eq("id", fresh.id)
        .neq("status", "disconnected")
        .select("*")
        .single();
      if (updated.error) throw updated.error;
      await project(app.id);
      return json({ sync: await sync(updated.data, token) });
    }
    if (body.action === "retry_sync")
      return json({ sync: await sync(fresh, token) });
    return json({ error: "Unknown action" }, 400);
  });
}
Deno.serve(async (req) => {
  try {
    return await handle(req);
  } catch (cause) {
    const message = (cause as Error).message;
    if (message === "A domain-verified app owner is required")
      return json({ error: message }, 403);
    // Never expose provider responses or credential-bearing errors.
    return json(
      {
        error: message.startsWith("PostHog")
          ? message
          : "PostHog request failed",
      },
      502,
    );
  }
});
