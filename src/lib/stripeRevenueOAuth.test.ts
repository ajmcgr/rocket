import { describe, expect, it } from "vitest";
import { revenueMode, revenueOAuthConfig, validateRevenueTokens, revenueInstallationMode,
  createRevenueOAuthState, revenueStateMode, revenueAuthorizationUrl, REVENUE_REDIRECT_URI } from "../../supabase/functions/_shared/stripeRevenueOAuth";
import { calculateSubscriptionMrr, type RevenueSubscription } from "../../supabase/functions/_shared/stripeRevenueMrr";

const config = {
  STRIPE_REVENUE_TEST_OAUTH_URL: "https://marketplace.stripe.com/oauth/v2/authorize?client_id=ca_fixture",
  STRIPE_REVENUE_APP_TEST_API_KEY: "sk_test_fixture_not_a_credential",
  STRIPE_REVENUE_LIVE_OAUTH_URL: "https://marketplace.stripe.com/oauth/v2/authorize?client_id=ca_live_fixture",
  STRIPE_REVENUE_APP_LIVE_API_KEY: "sk_live_fixture_not_a_credential",
  STRIPE_REVENUE_PUBLIC_CLIENT_ID: "ca_publicfixture",
};
const env = (extra: Record<string, string> = {}) => (name: string) => ({ ...config, ...extra } as Record<string, string>)[name];
const tokens = { livemode: false, scope: "stripe_apps", stripe_user_id: "acct_fixture",
  access_token: "fixture", refresh_token: "fixture" };

describe("Stripe revenue OAuth isolation", () => {
  it("defaults production connections to Marketplace and requires explicit external testing", () => {
    expect(revenueInstallationMode(undefined)).toBe("live");
    expect(revenueInstallationMode("marketplace")).toBe("live");
    expect(revenueInstallationMode("external_test")).toBe("test");
    expect(() => revenueInstallationMode("live_test")).toThrow("invalid");
  });
  it("constructs the public URL independently of external-test and legacy live links", () => {
    const state = createRevenueOAuthState("live");
    const url = revenueAuthorizationUrl(env({ STRIPE_REVENUE_LIVE_ENABLED: "true",
      STRIPE_REVENUE_LIVE_OAUTH_URL: "https://marketplace.stripe.com/oauth/v2/chnlink_wrong/authorize?client_id=wrong" }),
      "live", state, REVENUE_REDIRECT_URI);
    expect(url.origin + url.pathname).toBe("https://marketplace.stripe.com/oauth/v2/authorize");
    expect([...url.searchParams.keys()].sort()).toEqual(["client_id", "redirect_uri", "state"]);
    expect(url.searchParams.get("client_id")).toBe(config.STRIPE_REVENUE_PUBLIC_CLIENT_ID);
    expect(url.searchParams.get("redirect_uri")).toBe(REVENUE_REDIRECT_URI);
    expect(url.searchParams.get("state")).toBe(state);
    expect(() => revenueAuthorizationUrl(env(), "test", createRevenueOAuthState("test"), "https://evil.invalid"))
      .toThrow("callback");
  });
  it("preserves the deployed external-test channel path only in test configuration", () => {
    const raw = "https://marketplace.stripe.com/oauth/v2/chnlink_fixture/authorize?client_id=ca_fixture";
    expect(revenueOAuthConfig(env({ STRIPE_REVENUE_TEST_OAUTH_URL: raw }), "test").url.pathname)
      .toBe("/oauth/v2/chnlink_fixture/authorize");
    expect(() => revenueOAuthConfig(env({ STRIPE_REVENUE_LIVE_ENABLED: "true", STRIPE_REVENUE_PUBLIC_CLIENT_ID: "" }), "live"))
      .toThrow("public client ID");
  });
  it("generates unpredictable state with a mode bound into its complete hashed value", async () => {
    const first = createRevenueOAuthState("test"), second = createRevenueOAuthState("test");
    expect(first).toMatch(/^test\.[A-Za-z0-9_-]{43}$/);
    expect(second).not.toBe(first);
    expect(revenueStateMode(first, "live")).toBe("test");
    expect(revenueStateMode(createRevenueOAuthState("live"), "test")).toBe("live");
    const hash = (state: string) => crypto.subtle.digest("SHA-256", new TextEncoder().encode(state));
    expect(new Uint8Array(await hash(first))).not.toEqual(new Uint8Array(await hash(first.replace("test.", "live."))));
    expect(() => revenueAuthorizationUrl(env(), "test", createRevenueOAuthState("live"), REVENUE_REDIRECT_URI))
      .toThrow("mode mismatch");
    expect(() => revenueStateMode("test.bad", "test")).toThrow("invalid");
    expect(revenueStateMode("a".repeat(43), "test")).toBe("test");
  });
  it("defaults to test and requires an explicit live gate", () => {
    expect(revenueMode(env())).toBe("test");
    expect(() => revenueOAuthConfig(env(), "live")).toThrow("not enabled");
    expect(() => revenueMode(env({ STRIPE_REVENUE_MODE: "production" }))).toThrow("invalid");
    expect(revenueOAuthConfig(env({ STRIPE_REVENUE_MODE: "live", STRIPE_REVENUE_LIVE_ENABLED: "true" })).apiKey)
      .toBe(config.STRIPE_REVENUE_APP_LIVE_API_KEY);
  });
  it("never falls back to billing or opposite-mode credentials", () => {
    expect(() => revenueOAuthConfig(env({ STRIPE_REVENUE_APP_TEST_API_KEY: "", STRIPE_SECRET_KEY: "sk_test_billing" })))
      .toThrow("awaiting");
    expect(() => revenueOAuthConfig(env({ STRIPE_REVENUE_APP_TEST_API_KEY: "sk_live_fixture" })))
      .toThrow("selected mode");
  });
  it.each([
    "https://marketplace.stripe.com.evil.invalid/oauth/v2/authorize?client_id=x",
    "https://user@marketplace.stripe.com/oauth/v2/authorize?client_id=x",
    "https://marketplace.stripe.com:444/oauth/v2/authorize?client_id=x",
    "https://marketplace.stripe.com/oauth/v2/authorize?client_id=x&client_id=y",
    "https://marketplace.stripe.com/oauth/v2/authorize?client_id=x#fragment",
    "not-a-url",
  ])("rejects unsafe authorize URLs: %s", (url) => {
    expect(() => revenueOAuthConfig(env({ STRIPE_REVENUE_TEST_OAUTH_URL: url }))).toThrow("invalid");
  });
  it("checks mode, account, scope and nonempty tokens on initial exchange and refresh", () => {
    expect(() => validateRevenueTokens(tokens, "test", "acct_fixture")).not.toThrow();
    expect(() => validateRevenueTokens({ ...tokens, livemode: true }, "live")).not.toThrow();
    for (const patch of [{ livemode: true }, { scope: "read_write" }, { stripe_user_id: "acct_other" },
      { access_token: "" }, { refresh_token: "" }, { stripe_user_id: "invalid" }]) {
      expect(() => validateRevenueTokens({ ...tokens, ...patch }, "test", "acct_fixture")).toThrow();
    }
  });
});

describe("Stripe revenue calculation acceptance fixtures", () => {
  const mappings = [{ price_id: "price_fixture", product_id: "prod_fixture", currency: "usd" }];
  const subscription: RevenueSubscription = { id: "sub_fixture", status: "active", livemode: false,
    items: [{ quantity: 2, price: { id: "price_fixture", product: "prod_fixture", currency: "usd",
      unit_amount_decimal: "12000", billing_scheme: "per_unit",
      recurring: { interval: "year", interval_count: 1, usage_type: "licensed" } } }] };
  it("normalizes annual quantity and excludes other app prices", () => {
    const result = calculateSubscriptionMrr([subscription], mappings, 1000)[0];
    expect(result.mrr_minor).toBe("2000.000000");
    expect(result.verification_status).toBe("verified");
    expect(calculateSubscriptionMrr([subscription], [{ ...mappings[0], price_id: "price_other" }], 1000)[0].mrr_minor)
      .toBe("0.000000");
  });
  it("fails closed for discounted active subscriptions", () => {
    expect(calculateSubscriptionMrr([{ ...subscription, discounts: [{}] }], mappings, 1000)[0].verification_status)
      .toBe("unsupported");
  });
  it("excludes trials, paused collection and completed cancellations", () => {
    for (const patch of [{ status: "trialing" }, { pause_collection: {} },
      { cancel_at_period_end: true, cancel_at: 999 }]) {
      expect(calculateSubscriptionMrr([{ ...subscription, ...patch }], mappings, 1000)[0].mrr_minor).toBe("0.000000");
    }
  });
});
