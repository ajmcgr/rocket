import { base64url, CORS_HEADERS, getActiveClient, getAdmin, getRocketUser, json, parseAuthorizationRequest, redirectWith, sha256 } from "../_shared/rocketConnect.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    const body = await req.json();
    const request = parseAuthorizationRequest(body);
    if (!request) return json({ error: "invalid_request", error_description: "Invalid OAuth authorization request." }, 400);
    const client = await getActiveClient(request.clientId);
    // Phase 1 deliberately supports public PKCE clients only. A confidential client
    // must not become usable until client authentication is implemented at /token.
    if (!client || client.client_type !== "public" || !client.redirect_uris.includes(request.redirectUri)) return json({ error: "invalid_request", error_description: "Unknown client or redirect URI." }, 400);
    // Production integrations must bind the browser round-trip and ID token
    // to the initiating app session. Retain historical test-client behavior.
    if (client.environment === "production" && (request.state.length < 16 || !request.nonce || request.nonce.length < 16)) {
      return json({ error: "invalid_request", error_description: "Production authorization requires state and nonce." }, 400);
    }
    if (!request.scope.every((scope) => client.allowed_scopes.includes(scope))) return json({ error: "invalid_scope" }, 400);
    if (body.action === "inspect") return json({ client: { name: client.name, icon_url: client.icon_url }, scopes: request.scope });

    const user = await getRocketUser(req);
    if (!user) return json({ error: "login_required" }, 401);
    if (body.action === "deny") return json({ redirect_to: redirectWith(request.redirectUri, { error: "access_denied", state: request.state }) });
    if (body.action !== "approve") return json({ error: "invalid_request" }, 400);

    const admin = getAdmin();
    const { data: authorization, error: authorizationError } = await admin.from("rocket_oauth_authorizations")
      .upsert({ user_id: user.id, client_id: client.client_id, scopes: request.scope, granted_at: new Date().toISOString(), revoked_at: null }, { onConflict: "user_id,client_id" })
      .select("id").single();
    if (authorizationError || !authorization) throw authorizationError || new Error("Could not store authorization");
    const code = base64url(crypto.getRandomValues(new Uint8Array(32)));
    const { error: codeError } = await admin.from("rocket_oauth_codes").insert({
      code_hash: await sha256(code), authorization_id: authorization.id, user_id: user.id, client_id: client.client_id,
      redirect_uri: request.redirectUri, scopes: request.scope, code_challenge: request.codeChallenge, nonce: request.nonce || null,
      expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
    });
    if (codeError) throw codeError;
    await admin.from("rocket_oauth_events").insert({ user_id: user.id, client_id: client.client_id, event_type: "authorization_granted", detail: { scopes: request.scope } });
    return json({ redirect_to: redirectWith(request.redirectUri, { code, state: request.state }) });
  } catch (error) {
    console.error("rocket-connect-authorize", error);
    return json({ error: "server_error" }, 500);
  }
});
