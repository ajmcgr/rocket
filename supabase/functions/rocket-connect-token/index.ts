import { base64url, getActiveClient, getAdmin, issuer, json, sha256, signIdToken } from "../_shared/rocketConnect.ts";

async function parseBody(req: Request) {
  const type = req.headers.get("content-type") || "";
  if (type.includes("application/x-www-form-urlencoded")) return Object.fromEntries(new URLSearchParams(await req.text()));
  return await req.json();
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    const body = await parseBody(req);
    if (body.grant_type !== "authorization_code" || typeof body.client_id !== "string" || typeof body.code !== "string" || typeof body.redirect_uri !== "string" || typeof body.code_verifier !== "string") return json({ error: "invalid_request" }, 400);
    const client = await getActiveClient(body.client_id);
    // Do not accept a registered confidential client without authenticating it.
    // Phase 1 has only public clients protected by mandatory S256 PKCE.
    if (!client || client.client_type !== "public" || !client.redirect_uris.includes(body.redirect_uri)) return json({ error: "invalid_client" }, 401);
    const admin = getAdmin();
    const { data: code } = await admin.from("rocket_oauth_codes").select("*").eq("code_hash", await sha256(body.code)).maybeSingle();
    if (!code || code.client_id !== client.client_id || code.redirect_uri !== body.redirect_uri || code.consumed_at || new Date(code.expires_at).getTime() <= Date.now()) return json({ error: "invalid_grant" }, 400);
    if (await sha256(body.code_verifier) !== code.code_challenge) return json({ error: "invalid_grant" }, 400);
    const { data: consumed } = await admin.from("rocket_oauth_codes").update({ consumed_at: new Date().toISOString() }).eq("id", code.id).is("consumed_at", null).select("id").maybeSingle();
    if (!consumed) return json({ error: "invalid_grant" }, 400);
    const token = base64url(crypto.getRandomValues(new Uint8Array(32)));
    const expiresAt = new Date(Date.now() + 60 * 60_000).toISOString();
    const { error } = await admin.from("rocket_oauth_access_tokens").insert({ token_hash: await sha256(token), authorization_id: code.authorization_id, user_id: code.user_id, client_id: code.client_id, scopes: code.scopes, expires_at: expiresAt });
    if (error) throw error;
    const { data: userData } = await admin.auth.admin.getUserById(code.user_id);
    if (!userData.user) throw new Error("Authorized user no longer exists");
    const now = Math.floor(Date.now() / 1000);
    const claims: Record<string, unknown> = { iss: issuer(), sub: code.user_id, aud: code.client_id, iat: now, exp: now + 3600 };
    if (code.nonce) claims.nonce = code.nonce;
    if (code.scopes.includes("email")) { claims.email = userData.user.email || null; claims.email_verified = Boolean(userData.user.email_confirmed_at); }
    const idToken = await signIdToken(claims);
    await admin.from("rocket_oauth_events").insert({ user_id: code.user_id, client_id: code.client_id, event_type: "token_issued", detail: {} });
    return json({ access_token: token, id_token: idToken, token_type: "Bearer", expires_in: 3600, scope: code.scopes.join(" ") });
  } catch (error) { console.error("rocket-connect-token", error); return json({ error: "server_error" }, 500); }
});
