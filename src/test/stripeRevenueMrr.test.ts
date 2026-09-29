import { describe, expect, it } from "vitest";
import { calculateSubscriptionMrr, type RevenueSubscription } from "../../supabase/functions/_shared/stripeRevenueMrr";

const mapping = [
  { price_id: "price_month", product_id: "prod_one", currency: "usd" },
  { price_id: "price_year", product_id: "prod_one", currency: "usd" },
];
const item = (id: string, amount: string, interval: "month" | "year", quantity = 1) => ({
  price: { id, product: "prod_one", currency: "usd", unit_amount_decimal: amount,
    billing_scheme: "per_unit", recurring: { interval, interval_count: 1, usage_type: "licensed" } }, quantity,
});
const sub = (id: string, items: RevenueSubscription["items"], patch: Partial<RevenueSubscription> = {}): RevenueSubscription =>
  ({ id, status: "active", livemode: true, items, ...patch });

describe("Stripe Subscription MRR v1", () => {
  it("normalizes annual and monthly licensed prices without floating point", () => {
    const result = calculateSubscriptionMrr([
      sub("one", [item("price_month", "1000", "month", 2)]),
      sub("two", [item("price_year", "12000", "year")]),
    ], mapping, 0);
    expect(result).toEqual([{ currency: "usd", mrr_minor: "3000.000000", included_subscriptions: 2,
      excluded_subscriptions: 0, unsupported_subscriptions: 0, verification_status: "verified" }]);
  });
  it("keeps a period-end cancellation included until it ends and excludes nonactive statuses", () => {
    const result = calculateSubscriptionMrr([
      sub("canceling", [item("price_month", "500", "month")], { cancel_at_period_end: true, cancel_at: 200 }),
      sub("trial", [item("price_month", "500", "month")], { status: "trialing" }),
      sub("paused", [item("price_month", "500", "month")], { pause_collection: { behavior: "void" } }),
    ], mapping, 100);
    expect(result[0].mrr_minor).toBe("500.000000");
    expect(result[0].excluded_subscriptions).toBe(2);
    expect(calculateSubscriptionMrr([sub("ended", [item("price_month", "500", "month")],
      { cancel_at_period_end: true, cancel_at: 200 })], mapping, 201)[0].mrr_minor).toBe("0.000000");
  });
  it("never mixes unmapped app revenue into the selected app", () => {
    const result = calculateSubscriptionMrr([sub("mixed", [item("price_month", "1000", "month"),
      item("other_app_price", "9000", "month")])], mapping, 0);
    expect(result[0].mrr_minor).toBe("1000.000000");
  });
  it("fails closed on discounts, tiered or metered prices, and ambiguous amounts", () => {
    const discounted = sub("discounted", [item("price_month", "1000", "month")], { discounts: ["di_123"] });
    const tiered = sub("tiered", [{ ...item("price_month", "1000", "month"), price: {
      ...item("price_month", "1000", "month").price, billing_scheme: "tiered" } }]);
    const result = calculateSubscriptionMrr([discounted, tiered], mapping, 0);
    expect(result[0].verification_status).toBe("unsupported");
    expect(result[0].unsupported_subscriptions).toBe(2);
    expect(result[0].mrr_minor).toBe("0.000000");
  });
  it("keeps currencies separate and rejects changed product or currency bindings", () => {
    const result = calculateSubscriptionMrr([sub("bad", [{ ...item("price_month", "1000", "month"),
      price: { ...item("price_month", "1000", "month").price, product: "prod_wrong" } }])], mapping, 0);
    expect(result[0].verification_status).toBe("unsupported");
  });
  it("keeps zero-decimal currencies in Stripe minor units without FX conversion", () => {
    const yenMapping = [{ price_id: "price_yen", product_id: "prod_jp", currency: "jpy" }];
    const yen = sub("yen", [{ price: { id: "price_yen", product: "prod_jp", currency: "jpy",
      unit_amount_decimal: "1200", billing_scheme: "per_unit",
      recurring: { interval: "year", interval_count: 1, usage_type: "licensed" } }, quantity: 1 }]);
    const result = calculateSubscriptionMrr([yen], yenMapping, 0);
    expect(result[0].currency).toBe("jpy");
    expect(result[0].mrr_minor).toBe("100.000000");
  });
  it("normalizes multi-year prices and rejects item discounts", () => {
    const multiYear = sub("multi", [{ price: { id: "price_year", product: "prod_one", currency: "usd",
      unit_amount_decimal: "24000", billing_scheme: "per_unit",
      recurring: { interval: "year", interval_count: 2, usage_type: "licensed" } }, quantity: 1 }]);
    expect(calculateSubscriptionMrr([multiYear], mapping, 0)[0].mrr_minor).toBe("1000.000000");
    const discountedItem = sub("item-discount", [{ ...item("price_month", "1000", "month"), discounts: ["di_123"] }]);
    expect(calculateSubscriptionMrr([discountedItem], mapping, 0)[0].verification_status).toBe("unsupported");
  });
});
