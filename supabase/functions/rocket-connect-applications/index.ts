import { CORS_HEADERS, getAdmin, getRocketUser, json } from "../_shared/rocketConnect.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "GET" && req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const user = await getRocketUser(req);
  if (!user) return json({ error: "unauthorized" }, 401);
  const admin = getAdmin();
  if (req.method === "GET") {
    const { data, error } = await admin.from("rocket_oauth_authorizations")
      .select("id,client_id,scopes,granted_at,rocket_oauth_clients(name,icon_url)").eq("user_id", user.id).is("revoked_at", null).order("granted_at", { ascending: false });
    if (error) return json({ error: "server_error" }, 500);
    return json({ applications: data || [] });
  }
  const body = await req.json();
  if (typeof body.client_id !== "string") return json({ error: "invalid_request" }, 400);
  const { data: authorization } = await admin.from("rocket_oauth_authorizations").update({ revoked_at: new Date().toISOString() }).eq("user_id", user.id).eq("client_id", body.client_id).is("revoked_at", null).select("id").maybeSingle();
  if (!authorization) return json({ error: "not_found" }, 404);
  await admin.from("rocket_oauth_access_tokens").update({ revoked_at: new Date().toISOString() }).eq("authorization_id", authorization.id).is("revoked_at", null);
  await admin.from("rocket_oauth_codes").update({ consumed_at: new Date().toISOString() }).eq("authorization_id", authorization.id).is("consumed_at", null);
  await admin.from("rocket_oauth_events").insert({ user_id: user.id, client_id: body.client_id, event_type: "authorization_revoked", detail: {} });
  return json({ revoked: true });
});
