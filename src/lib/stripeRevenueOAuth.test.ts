import { describe, expect, it } from "vitest";
import { revenueMode, revenueOAuthConfig, validateRevenueTokens } from "../../supabase/functions/_shared/stripeRevenueOAuth";
import { calculateSubscriptionMrr, type RevenueSubscription } from "../../supabase/functions/_shared/stripeRevenueMrr";

const config = {
  STRIPE_REVENUE_TEST_OAUTH_URL: "https://marketplace.stripe.com/oauth/v2/authorize?client_id=ca_fixture",
  STRIPE_REVENUE_APP_TEST_API_KEY: "sk_test_fixture_not_a_credential",
  STRIPE_REVENUE_LIVE_OAUTH_URL: "https://marketplace.stripe.com/oauth/v2/authorize?client_id=ca_live_fixture",
  STRIPE_REVENUE_APP_LIVE_API_KEY: "sk_live_fixture_not_a_credential",
};
const env = (extra: Record<string, string> = {}) => (name: string) => ({ ...config, ...extra } as Record<string, string>)[name];
const tokens = { livemode: false, scope: "stripe_apps", stripe_user_id: "acct_fixture",
  access_token: "fixture", refresh_token: "fixture" };

describe("Stripe revenue OAuth isolation", () => {
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
