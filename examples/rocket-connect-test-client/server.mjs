import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";

const port = Number(process.env.PORT || 3001);
const clientId = process.env.ROCKET_CLIENT_ID || "rocket-connect-test-web";
const rocketUrl = (process.env.ROCKET_URL || "https://tryrocket.ai").replace(/\/$/, "");
const supabaseUrl = (process.env.ROCKET_SUPABASE_URL || "https://lcujmvdgczkjxdstzhnr.supabase.co").replace(/\/$/, "");
const redirectUri = process.env.ROCKET_REDIRECT_URI || `http://localhost:${port}/callback`;
const pending = new Map();
const sessions = new Map();
const b64url = (value) => Buffer.from(value).toString("base64url");
const cookie = (req, name) => Object.fromEntries((req.headers.cookie || "").split("; ").filter(Boolean).map((v) => v.split("=")))[name];
const html = (body) => `<!doctype html><html><head><meta charset="utf-8"><title>Rocket Connect Test App</title><style>body{font:16px system-ui;max-width:680px;margin:80px auto;padding:0 24px;color:#172033}a,button{display:inline-block;background:#079ad7;color:white;border:0;border-radius:9px;padding:12px 18px;text-decoration:none;font-weight:650;cursor:pointer}code{background:#f3f4f6;padding:2px 5px;border-radius:4px}pre{white-space:pre-wrap;background:#f3f4f6;padding:16px;border-radius:10px}</style></head><body>${body}</body></html>`;

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  if (url.pathname === "/") {
    const session = sessions.get(cookie(req, "rocket_test_session"));
    res.end(html(session ? `<h1>Connected to Rocket</h1><p>This independent app established its own server session.</p><pre>${JSON.stringify(session, null, 2)}</pre><a href="/logout">Log out</a>` : `<h1>Independent Rocket Connect test app</h1><p>This app is separate from Rocket. It uses OAuth authorization code + PKCE.</p><a href="/login">Continue with Rocket</a>`));
    return;
  }
  if (url.pathname === "/login") {
    const state = b64url(randomBytes(24)); const verifier = b64url(randomBytes(48)); const nonce = b64url(randomBytes(24));
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    pending.set(state, { verifier, nonce, createdAt: Date.now() });
    const authorize = new URL(`${rocketUrl}/connect/authorize`);
    Object.entries({ response_type: "code", client_id: clientId, redirect_uri: redirectUri, scope: "openid profile email", state, nonce, code_challenge: challenge, code_challenge_method: "S256" }).forEach(([key, value]) => authorize.searchParams.set(key, value));
    res.writeHead(302, { Location: authorize, "Set-Cookie": `rocket_test_state=${state}; HttpOnly; SameSite=Lax; Path=/; Max-Age=600` }); res.end(); return;
  }
  if (url.pathname === "/callback") {
    const state = url.searchParams.get("state"); const code = url.searchParams.get("code"); const request = state && pending.get(state);
    pending.delete(state);
    if (!state || state !== cookie(req, "rocket_test_state") || !code || !request || Date.now() - request.createdAt > 600000) { res.statusCode = 400; res.end(html("<h1>Invalid OAuth response</h1><p>State validation failed.</p>")); return; }
    const tokenResponse = await fetch(`${supabaseUrl}/functions/v1/rocket-connect-token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "authorization_code", client_id: clientId, code, redirect_uri: redirectUri, code_verifier: request.verifier }) });
    const tokens = await tokenResponse.json();
    if (!tokenResponse.ok) { res.statusCode = 502; res.end(html(`<h1>Token exchange failed</h1><pre>${JSON.stringify(tokens, null, 2)}</pre>`)); return; }
    const profileResponse = await fetch(`${supabaseUrl}/functions/v1/rocket-connect-userinfo`, { headers: { Authorization: `Bearer ${tokens.access_token}` } });
    const profile = await profileResponse.json();
    if (!profileResponse.ok) { res.statusCode = 502; res.end(html(`<h1>Userinfo failed</h1><pre>${JSON.stringify(profile, null, 2)}</pre>`)); return; }
    const id = b64url(randomBytes(32)); sessions.set(id, { ...profile, connected_at: new Date().toISOString() });
    res.writeHead(302, { Location: "/", "Set-Cookie": `rocket_test_session=${id}; HttpOnly; SameSite=Lax; Path=/; Max-Age=3600` }); res.end(); return;
  }
  if (url.pathname === "/logout") { const id = cookie(req, "rocket_test_session"); sessions.delete(id); res.writeHead(302, { Location: "/", "Set-Cookie": "rocket_test_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0" }); res.end(); return; }
  res.statusCode = 404; res.end("Not found");
}).listen(port, () => console.log(`Rocket Connect test client: http://localhost:${port}`));
