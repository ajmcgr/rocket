import { describe, expect, it } from "vitest";
import { calculateValuation, validateValuationInputs, VALUATION_MODEL_VERSION, type ValuationInputs } from "./rocketValuation";

const base: ValuationInputs = { currency: "USD", mrr: 2000, monthlyTraffic: 5000, monthlyRevenueGrowthPct: 2, ageMonths: 24, businessModel: "saas" };

describe("Rocket Valuation", () => {
  it("works anonymously and versions results", () => {
    const result = calculateValuation(base);
    expect(result.modelVersion).toBe(VALUATION_MODEL_VERSION);
    expect(result.basis).toBe("annual_recurring_revenue");
    expect(result.low).toBeLessThan(result.central!);
    expect(result.high).toBeGreaterThan(result.central!);
    expect(result.evidence).toEqual({ stripe: false, ga4: false });
  });
  it("does not fabricate a value for pre-revenue traffic", () => {
    const result = calculateValuation({ ...base, mrr: 0, monthlyTraffic: 100000 });
    expect(result.basis).toBe("insufficient_evidence");
    expect(result.central).toBeNull();
  });
  it("uses profit once, without adding ARR", () => {
    const a = calculateValuation({ ...base, monthlyProfit: 600, annualRecurringRevenue: 24000 });
    const b = calculateValuation({ ...base, monthlyProfit: 600, annualRecurringRevenue: 50000 });
    expect(a.basis).toBe("annual_profit");
    expect(a.central).toBe(b.central);
  });
  it("reflects positive and negative growth", () => {
    const growing = calculateValuation({ ...base, monthlyRevenueGrowthPct: 15 });
    const shrinking = calculateValuation({ ...base, monthlyRevenueGrowthPct: -15 });
    expect(growing.central!).toBeGreaterThan(shrinking.central!);
  });
  it.each(["USD", "EUR", "GBP"] as const)("preserves %s without exchange assumptions", (currency) => {
    expect(calculateValuation({ ...base, currency }).currency).toBe(currency);
  });
  it("rejects invalid, missing and extreme inputs", () => {
    expect(validateValuationInputs({ ...base, mrr: Number.NaN })).not.toHaveLength(0);
    expect(validateValuationInputs({ ...base, mrr: 1e12 })).not.toHaveLength(0);
    expect(() => calculateValuation({ ...base, ageMonths: -1 })).toThrow();
  });
});
