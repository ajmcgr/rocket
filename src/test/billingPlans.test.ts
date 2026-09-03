import { describe, expect, it } from "vitest";
import {
  MONTHLY_LIMITS,
  paidPlanFromProduct,
  paidPlanFromSubscription,
} from "../../supabase/functions/_shared/billingPlans";

describe("Stripe subscription plan mapping", () => {
  it.each([
    ["starter", "starter"],
    ["starter_yearly", "starter"],
    ["growth", "growth"],
    ["pro_yearly", "growth"],
    ["business", "business"],
    ["business_yearly", "business"],
  ] as const)("maps %s to %s", (product, plan) => {
    expect(paidPlanFromProduct(product)).toBe(plan);
  });

  it.each([
    [1200, "starter"],
    [9900, "starter"],
    [2000, "growth"],
    [16600, "growth"],
    [5000, "business"],
    [41500, "business"],
  ] as const)("recovers %s-cent legacy subscriptions as %s", (unitAmount, plan) => {
    expect(paidPlanFromSubscription({ metadata: {}, items: { data: [{ price: { unit_amount: unitAmount } }] } })).toBe(plan);
  });

  it("keeps each plan's correct monthly entitlement", () => {
    expect(MONTHLY_LIMITS).toEqual({ free: 100, starter: 500, growth: 3000, business: 15000 });
  });
});
