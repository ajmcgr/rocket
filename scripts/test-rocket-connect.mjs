const base = process.env.ROCKET_CONNECT_SUPABASE_URL || "https://lcujmvdgczkjxdstzhnr.supabase.co";
const endpoint = `${base}/functions/v1/rocket-connect-authorize`;
const challenge = "a".repeat(43);

async function request(overrides = {}) {
  const body = {
    action: "inspect", response_type: "code", client_id: "rocket-connect-test-web",
    redirect_uri: "http://localhost:3001/callback", scope: "openid profile", state: "security-check",
    code_challenge: challenge, code_challenge_method: "S256", ...overrides,
  };
  return fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

const discovery = await fetch(`${base}/functions/v1/rocket-connect-discovery`);
if (!discovery.ok) throw new Error(`Discovery failed: ${discovery.status}`);
const configuration = await discovery.json();
if (!configuration.code_challenge_methods_supported?.includes("S256") || !configuration.scopes_supported?.includes("openid")) throw new Error("Discovery does not advertise required Connect controls");

const jwks = await fetch(`${base}/functions/v1/rocket-connect-jwks`);
const keys = await jwks.json();
if (!jwks.ok || keys.keys?.[0]?.d || keys.keys?.[0]?.alg !== "ES256") throw new Error("JWKS must expose a public ES256 key only");

if (!(await request()).ok) throw new Error("Registered exact redirect URI was rejected");
for (const bad of [
  { redirect_uri: "https://attacker.example/callback" },
  { redirect_uri: "http://localhost:9999/callback" },
  { scope: "openid admin" },
  { client_id: "unknown-client" },
  { code_challenge_method: "plain" },
]) {
  const response = await request(bad);
  if (response.status !== 400) throw new Error(`Expected invalid request to fail closed with 400, got ${response.status}`);
}
console.log("Rocket Connect public security checks passed.");
