import { createHash, randomBytes, webcrypto } from "node:crypto";
import { createServer } from "node:http";

const port = Number(process.env.PORT || 3001);
const clientId = process.env.ROCKET_CLIENT_ID || "rocket-connect-test-web";
const rocketUrl = (process.env.ROCKET_URL || "https://tryrocket.ai").replace(/\/$/, "");
const supabaseUrl = (process.env.ROCKET_SUPABASE_URL || "https://lcujmvdgczkjxdstzhnr.supabase.co").replace(/\/$/, "");
const redirectUri = process.env.ROCKET_REDIRECT_URI || `http://127.0.0.1:${port}/callback`;
const issuer = `${rocketUrl}/connect`;
const jwksUrl = `${supabaseUrl}/functions/v1/rocket-connect-jwks`;
const userinfoUrl = `${supabaseUrl}/functions/v1/rocket-connect-userinfo`;
const entitlementUrl = `${supabaseUrl}/functions/v1/connect-entitlements`;
const checkoutUrl = `${supabaseUrl}/functions/v1/connect-payment-checkout`;
const pending = new Map();
const sessions = new Map();
const b64url = (value) => Buffer.from(value).toString("base64url");
const cookie = (req, name) => Object.fromEntries((req.headers.cookie || "").split("; ").filter(Boolean).map((v) => v.split("=")))[name];
const html = (body) => `<!doctype html><html><head><meta charset="utf-8"><title>Rocket Connect Test App</title><style>body{font:16px system-ui;max-width:680px;margin:80px auto;padding:0 24px;color:#172033}a,button{display:inline-block;background:#079ad7;color:white;border:0;border-radius:9px;padding:12px 18px;text-decoration:none;font-weight:650;cursor:pointer}code{background:#f3f4f6;padding:2px 5px;border-radius:4px}pre{white-space:pre-wrap;background:#f3f4f6;padding:16px;border-radius:10px}</style></head><body>${body}</body></html>`;

async function verifyIdToken(idToken, expectedNonce) {
  const parts = idToken?.split(".");
  if (parts?.length !== 3) throw new Error("Malformed ID token");
  const parsePart = (part) => JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
  const [header, claims] = [parsePart(parts[0]), parsePart(parts[1])];
  if (header.alg !== "ES256" || !header.kid) throw new Error("Unexpected ID token signing algorithm");
  const jwksResponse = await fetch(jwksUrl);
  const jwks = await jwksResponse.json();
  const jwk = jwks.keys?.find((key) => key.kid === header.kid && key.kty === "EC" && key.crv === "P-256");
  if (!jwksResponse.ok || !jwk) throw new Error("Rocket signing key was not found");
  const publicKey = await webcrypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
  const validSignature = await webcrypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, publicKey, Buffer.from(parts[2], "base64url"), Buffer.from(`${parts[0]}.${parts[1]}`));
  if (!validSignature) throw new Error("Invalid ID token signature");
  if (claims.iss !== issuer || claims.aud !== clientId || claims.nonce !== expectedNonce || !claims.sub || claims.exp <= Math.floor(Date.now() / 1000)) throw new Error("Invalid ID token claims");
  return claims;
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  if (url.pathname === "/") {
    const session = sessions.get(cookie(req, "rocket_test_session"));
    res.end(html(session ? `<h1>Connected to Rocket</h1><p>This independent app established its own server session after validating Rocket’s signed ID token and UserInfo response.</p><pre>${JSON.stringify({ sub: session.sub, name: session.name, email: session.email, connected_at: session.connected_at, rocket_access: session.rocket_access || "not checked", entitlement: session.entitlement || "not checked", invalid_pkce_verifier: session.invalid_pkce_verifier || "not checked", authorization_code_reuse: session.authorization_code_reuse || "not checked" }, null, 2)}</pre><a href="/buy">Buy $10/month test product</a> <a href="/verify-entitlement">Verify access entitlement</a> <a href="/verify-access">Verify Rocket access</a> <a href="/verify-code-reuse">Verify code replay rejection</a> <a href="/login">Authenticate again</a> <a href="/logout">Log out</a>` : `<h1>Independent Rocket Connect test app</h1><p>This app is separate from Rocket. It uses OAuth authorization code + PKCE.</p><a href="/login">Continue with Rocket</a>`));
    return;
  }
  if (url.pathname === "/login") {
    const state = b64url(randomBytes(24)); const verifier = b64url(randomBytes(48)); const nonce = b64url(randomBytes(24));
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    pending.set(state, { verifier, nonce, createdAt: Date.now(), testBadPkce: url.searchParams.get("test_bad_pkce") === "1" });
    const authorize = new URL(`${rocketUrl}/connect/authorize`);
    Object.entries({ response_type: "code", client_id: clientId, redirect_uri: redirectUri, scope: "openid profile email entitlements:read", state, nonce, code_challenge: challenge, code_challenge_method: "S256" }).forEach(([key, value]) => authorize.searchParams.set(key, value));
    res.writeHead(302, { Location: authorize, "Set-Cookie": `rocket_test_state=${state}; HttpOnly; SameSite=Lax; Path=/; Max-Age=600` }); res.end(); return;
  }
  if (url.pathname === "/callback") {
    const state = url.searchParams.get("state"); const code = url.searchParams.get("code"); const request = state && pending.get(state);
    pending.delete(state);
    if (!state || state !== cookie(req, "rocket_test_state") || !code || !request || Date.now() - request.createdAt > 600000) { res.statusCode = 400; res.end(html("<h1>Invalid OAuth response</h1><p>State validation failed.</p>")); return; }
    let invalidPkceRejected = false;
    if (request.testBadPkce) {
      const invalidPkceResponse = await fetch(`${supabaseUrl}/functions/v1/rocket-connect-token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "authorization_code", client_id: clientId, code, redirect_uri: redirectUri, code_verifier: b64url(randomBytes(48)) }) });
      invalidPkceRejected = invalidPkceResponse.status === 400;
      if (!invalidPkceRejected) { res.statusCode = 502; res.end(html("<h1>Invalid PKCE verifier was accepted</h1>")); return; }
    }
    const tokenResponse = await fetch(`${supabaseUrl}/functions/v1/rocket-connect-token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "authorization_code", client_id: clientId, code, redirect_uri: redirectUri, code_verifier: request.verifier }) });
    const tokens = await tokenResponse.json();
    if (!tokenResponse.ok) { res.statusCode = 502; res.end(html(`<h1>Token exchange failed</h1><pre>${JSON.stringify(tokens, null, 2)}</pre>`)); return; }
    let claims;
    try { claims = await verifyIdToken(tokens.id_token, request.nonce); } catch (error) { res.statusCode = 502; res.end(html(`<h1>ID token validation failed</h1><p>${error.message}</p>`)); return; }
    const profileResponse = await fetch(userinfoUrl, { headers: { Authorization: `Bearer ${tokens.access_token}` } });
    const profile = await profileResponse.json();
    if (!profileResponse.ok) { res.statusCode = 502; res.end(html(`<h1>Userinfo failed</h1><pre>${JSON.stringify(profile, null, 2)}</pre>`)); return; }
    if (profile.sub !== claims.sub) { res.statusCode = 502; res.end(html("<h1>Identity mismatch</h1><p>Rocket ID token and UserInfo subject did not match.</p>")); return; }
    const id = b64url(randomBytes(32)); sessions.set(id, { ...profile, access_token: tokens.access_token, consumed_code: code, verifier: request.verifier, connected_at: new Date().toISOString(), rocket_access: "active", invalid_pkce_verifier: request.testBadPkce ? (invalidPkceRejected ? "rejected" : "unexpectedly accepted") : "not checked" });
    res.writeHead(302, { Location: "/", "Set-Cookie": `rocket_test_session=${id}; HttpOnly; SameSite=Lax; Path=/; Max-Age=3600` }); res.end(); return;
  }
  if (url.pathname === "/verify-access") {
    const session = sessions.get(cookie(req, "rocket_test_session"));
    if (!session) { res.writeHead(302, { Location: "/" }); res.end(); return; }
    const response = await fetch(userinfoUrl, { headers: { Authorization: `Bearer ${session.access_token}` } });
    session.rocket_access = response.ok ? "active" : "revoked or expired";
    res.writeHead(302, { Location: "/" }); res.end(); return;
  }
  if (url.pathname === "/verify-entitlement") {
    const session = sessions.get(cookie(req, "rocket_test_session"));
    if (!session) { res.writeHead(302, { Location: "/" }); res.end(); return; }
    const response = await fetch(`${entitlementUrl}?product_key=rocket-connect-test-monthly`, { headers: { Authorization: `Bearer ${session.access_token}` } });
    const result = await response.json();
    session.entitlement = response.ok ? result.entitlements?.[0]?.active ? "Access Granted" : "No active access yet — webhook pending" : `Unable to check: ${result.error || response.status}`;
    res.writeHead(302, { Location: "/" }); res.end(); return;
  }
  if (url.pathname === "/buy") {
    const session = sessions.get(cookie(req, "rocket_test_session"));
    if (!session) { res.writeHead(302, { Location: "/" }); res.end(); return; }
    const response = await fetch(checkoutUrl, { method: "POST", headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" }, body: JSON.stringify({ product_key: "rocket-connect-test-monthly", return_uri: redirectUri.replace("/callback", "/") }) });
    const result = await response.json();
    if (!response.ok || !result.checkout_url) { session.entitlement = `Checkout unavailable: ${result.error || response.status}`; res.writeHead(302, { Location: "/" }); res.end(); return; }
    res.writeHead(303, { Location: result.checkout_url }); res.end(); return;
  }
  if (url.pathname === "/verify-code-reuse") {
    const session = sessions.get(cookie(req, "rocket_test_session"));
    if (!session) { res.writeHead(302, { Location: "/" }); res.end(); return; }
    const response = await fetch(`${supabaseUrl}/functions/v1/rocket-connect-token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "authorization_code", client_id: clientId, code: session.consumed_code, redirect_uri: redirectUri, code_verifier: session.verifier }) });
    session.authorization_code_reuse = response.status === 400 ? "rejected" : `unexpected status ${response.status}`;
    res.writeHead(302, { Location: "/" }); res.end(); return;
  }
  if (url.pathname === "/logout") { const id = cookie(req, "rocket_test_session"); sessions.delete(id); res.writeHead(302, { Location: "/", "Set-Cookie": "rocket_test_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0" }); res.end(); return; }
  res.statusCode = 404; res.end("Not found");
}).listen(port, "127.0.0.1", () => console.log(`Rocket Connect test client: http://127.0.0.1:${port}`));
