// Pure configuration and response checks. No account calls or secret logging.
export type RevenueMode = "test" | "live";
export type RevenueEnv = (name: string) => string | undefined;

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
  const raw = env(mode === "test" ? "STRIPE_REVENUE_TEST_OAUTH_URL" : "STRIPE_REVENUE_LIVE_OAUTH_URL");
  const apiKey = env(mode === "test" ? "STRIPE_REVENUE_APP_TEST_API_KEY" : "STRIPE_REVENUE_APP_LIVE_API_KEY");
  if (!raw || !apiKey) throw new Error("Stripe revenue verification is awaiting Stripe App setup");
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error("Stripe revenue OAuth configuration is invalid"); }
  if (url.origin !== "https://marketplace.stripe.com" || url.username || url.password
    || url.pathname !== "/oauth/v2/authorize" || url.hash
    || !url.searchParams.get("client_id") || url.searchParams.getAll("client_id").length !== 1)
    throw new Error("Stripe revenue OAuth configuration is invalid");
  if (!apiKey.startsWith(mode === "test" ? "sk_test_" : "sk_live_"))
    throw new Error("Stripe revenue developer key does not match the selected mode");
  return { mode, url, apiKey };
}

export function validateRevenueTokens(tokens: Record<string, unknown>, mode: RevenueMode, accountId?: unknown) {
  if (tokens.livemode !== (mode === "live") || tokens.scope !== "stripe_apps"
    || typeof tokens.stripe_user_id !== "string" || !/^acct_[A-Za-z0-9]+$/.test(tokens.stripe_user_id)
    || (accountId !== undefined && tokens.stripe_user_id !== accountId)
    || typeof tokens.access_token !== "string" || !tokens.access_token
    || typeof tokens.refresh_token !== "string" || !tokens.refresh_token)
    throw new Error("Stripe did not grant the expected App authorization; reconnect Stripe");
}
