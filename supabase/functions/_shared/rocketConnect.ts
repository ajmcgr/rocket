import { createClient } from "npm:@supabase/supabase-js@2.45.0";

export const PROVIDER_SCOPES = new Set(["openid", "profile", "email", "entitlements:read"]);
export const APP_URL = (Deno.env.get("APP_URL") || "https://tryrocket.ai").replace(/\/$/, "");
export const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
export const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
export const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": APP_URL,
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Vary": "Origin",
};

export const json = (value: unknown, status = 200, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...CORS_HEADERS, ...headers } });

export function base64url(bytes: Uint8Array) {
  let raw = "";
  bytes.forEach((byte) => raw += String.fromCharCode(byte));
  return btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export async function sha256(value: string) {
  return base64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))));
}

export function parseScope(value: unknown): string[] | null {
  if (typeof value !== "string") return null;
  const scopes = [...new Set(value.trim().split(/\s+/).filter(Boolean))];
  return scopes.length > 0 && scopes.every((scope) => PROVIDER_SCOPES.has(scope)) && scopes.includes("openid") ? scopes : null;
}

export function validRedirectUri(uri: string) {
  try {
    const url = new URL(uri);
    if (url.hash || url.username || url.password) return false;
    if (url.protocol === "https:") return true;
    return url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
  } catch { return false; }
}

export function validPkceChallenge(value: unknown) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{43,128}$/.test(value);
}

export function getAdmin() { return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY); }

export async function getConnectToken(req: Request) {
  const header = req.headers.get("Authorization") || "";
  if (!header.startsWith("Bearer ")) return null;
  const { data } = await getAdmin().from("rocket_oauth_access_tokens").select("*")
    .eq("token_hash", await sha256(header.slice(7))).is("revoked_at", null).maybeSingle();
  if (!data || new Date(data.expires_at).getTime() <= Date.now()) return null;
  const { data: authorization } = await getAdmin().from("rocket_oauth_authorizations")
    .select("id,revoked_at").eq("id", data.authorization_id).maybeSingle();
  return authorization && !authorization.revoked_at ? data as any : null;
}

export async function getRocketUser(req: Request) {
  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authorization } } });
  const { data, error } = await userClient.auth.getUser();
  return error ? null : data.user;
}

export async function getActiveClient(clientId: string) {
  const { data } = await getAdmin().from("rocket_oauth_clients")
    .select("client_id,name,icon_url,redirect_uris,allowed_scopes,client_type,is_active")
    .eq("client_id", clientId).eq("is_active", true).maybeSingle();
  return data as any | null;
}

export function parseAuthorizationRequest(input: Record<string, unknown>) {
  const clientId = typeof input.client_id === "string" ? input.client_id : "";
  const redirectUri = typeof input.redirect_uri === "string" ? input.redirect_uri : "";
  const state = typeof input.state === "string" ? input.state : "";
  const nonce = typeof input.nonce === "string" ? input.nonce : undefined;
  const scope = parseScope(input.scope);
  if (input.response_type !== "code" || !clientId || !validRedirectUri(redirectUri) || !scope || !validPkceChallenge(input.code_challenge) || input.code_challenge_method !== "S256" || state.length > 2048 || (nonce && nonce.length > 512)) return null;
  return { clientId, redirectUri, state, nonce, scope, codeChallenge: input.code_challenge as string };
}

export function redirectWith(uri: string, values: Record<string, string>) {
  const url = new URL(uri);
  Object.entries(values).forEach(([key, value]) => url.searchParams.set(key, value));
  return url.toString();
}

function oidcKey() {
  const value = Deno.env.get("ROCKET_CONNECT_OIDC_PRIVATE_JWK");
  if (!value) throw new Error("ROCKET_CONNECT_OIDC_PRIVATE_JWK not configured");
  const key = JSON.parse(value) as JsonWebKey;
  if (key.kty !== "EC" || key.crv !== "P-256" || !key.d || !key.x || !key.y) throw new Error("ROCKET_CONNECT_OIDC_PRIVATE_JWK must be an ES256 private JWK");
  return key;
}

export function issuer() { return `${APP_URL}/connect`; }

export async function signIdToken(claims: Record<string, unknown>) {
  const key = oidcKey();
  const header = base64url(new TextEncoder().encode(JSON.stringify({ alg: "ES256", typ: "JWT", kid: key.kid || "rocket-connect-1" })));
  const payload = base64url(new TextEncoder().encode(JSON.stringify(claims)));
  const signingKey = await crypto.subtle.importKey("jwk", key, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, signingKey, new TextEncoder().encode(`${header}.${payload}`)));
  return `${header}.${payload}.${base64url(signature)}`;
}

export function publicJwk() {
  const { d, key_ops, ext, ...key } = oidcKey() as JsonWebKey;
  return { ...key, use: "sig", alg: "ES256", kid: key.kid || "rocket-connect-1" };
}
