// Pure configuration and response checks. No account calls or secret logging.
export type RevenueMode = "test" | "live";
export type RevenueEnv = (name: string) => string | undefined;
export const REVENUE_REDIRECT_URI = "https://lcujmvdgczkjxdstzhnr.supabase.co/functions/v1/rocket-stripe-revenue";

export function revenueInstallationMode(installation: unknown): RevenueMode {
  if (installation === undefined || installation === "marketplace") return "live";
  if (installation === "external_test") return "test";
  throw new Error("Stripe revenue installation type is invalid");
}

export function createRevenueOAuthState(mode: RevenueMode) {
  const nonce = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  return `${mode}.${nonce}`;
}

export function revenueStateMode(state: string, legacyMode: RevenueMode): RevenueMode {
  const matched = /^(test|live)\.[A-Za-z0-9_-]{43}$/.exec(state);
  if (matched) return matched[1] as RevenueMode;
  // Existing ten-minute requests remain valid during rollout. The complete
  // state (including the new mode prefix) is hashed and consumed atomically.
  if (/^[A-Za-z0-9_-]{43}$/.test(state)) return legacyMode;
  throw new Error("Stripe revenue OAuth state is invalid");
}

export function revenueMode(env: RevenueEnv): RevenueMode {
  const mode = env("STRIPE_REVENUE_MODE") || "test";
  if (mode !== "test" && mode !== "live") throw new Error("Stripe revenue mode is invalid");
  if (mode === "live" && env("STRIPE_REVENUE_LIVE_ENABLED") !== "true")
    throw new Error("Stripe live revenue verification is not enabled");
  return mode;
}

export function revenueOAuthConfig(env: RevenueEnv, mode: RevenueMode = revenueMode(env)) {
  if (mode === "live" && env("STRIPE_REVENUE_LIVE_ENABLED") !== "true")
    throw new Error("Stripe live revenue verification is not enabled");
  const clientId = env("STRIPE_REVENUE_PUBLIC_CLIENT_ID");
  if (mode === "live" && (!clientId || !/^ca_[A-Za-z0-9]+$/.test(clientId)))
    throw new Error("Stripe revenue public client ID is not configured");
  // A public installation is built from its registered client ID, never an
  // external-test channel URL. Test configuration remains independently stored.
  const raw = mode === "test" ? env("STRIPE_REVENUE_TEST_OAUTH_URL")
    : `https://marketplace.stripe.com/oauth/v2/authorize?client_id=${clientId}`;
  const apiKey = env(mode === "test" ? "STRIPE_REVENUE_APP_TEST_API_KEY" : "STRIPE_REVENUE_APP_LIVE_API_KEY");
  if (!raw || !apiKey) throw new Error("Stripe revenue verification is awaiting Stripe App setup");
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error("Stripe revenue OAuth configuration is invalid"); }
  const validPath = url.pathname === "/oauth/v2/authorize"
    || (mode === "test" && /^\/oauth\/v2\/chnlink_[A-Za-z0-9]+\/authorize$/.test(url.pathname));
  if (url.origin !== "https://marketplace.stripe.com" || url.username || url.password
    || !validPath || url.hash
    || !url.searchParams.get("client_id") || url.searchParams.getAll("client_id").length !== 1)
    throw new Error("Stripe revenue OAuth configuration is invalid");
  if (!apiKey.startsWith(mode === "test" ? "sk_test_" : "sk_live_"))
    throw new Error("Stripe revenue developer key does not match the selected mode");
  return { mode, url, apiKey };
}

export function revenueAuthorizationUrl(env: RevenueEnv, mode: RevenueMode, state: string, redirectUri: string) {
  if (redirectUri !== REVENUE_REDIRECT_URI) throw new Error("Stripe revenue callback is invalid");
  if (revenueStateMode(state, mode) !== mode) throw new Error("Stripe revenue OAuth mode mismatch");
  const { url } = revenueOAuthConfig(env, mode);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  return url;
}

export function validateRevenueTokens(tokens: Record<string, unknown>, mode: RevenueMode, accountId?: unknown) {
  if (tokens.livemode !== (mode === "live") || tokens.scope !== "stripe_apps"
    || typeof tokens.stripe_user_id !== "string" || !/^acct_[A-Za-z0-9]+$/.test(tokens.stripe_user_id)
    || (accountId !== undefined && tokens.stripe_user_id !== accountId)
    || typeof tokens.access_token !== "string" || !tokens.access_token
    || typeof tokens.refresh_token !== "string" || !tokens.refresh_token)
    throw new Error("Stripe did not grant the expected App authorization; reconnect Stripe");
}
