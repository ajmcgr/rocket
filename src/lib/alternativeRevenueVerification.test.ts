import { describe, expect, it } from "vitest";
import { completeThirtyDayPeriod, verifiedDodoPaidVolume, verifiedPolarRevenue,
  verifiedProductIds } from "../../supabase/functions/_shared/alternativeRevenueVerification";

describe("alternative revenue evidence", () => {
  const period = completeThirtyDayPeriod(new Date("2026-10-12T12:00:00Z"));
  it("uses thirty complete UTC days", () => {
    expect(period).toEqual({ start: "2026-09-12", end: "2026-10-11" });
  });
  it("accepts only an owned, complete product catalogue", () => {
    expect(verifiedProductIds([{ id: "b", organization_id: "org" },
      { id: "a", organization_id: "org" }], "id", "organization_id", "org"))
      .toEqual(["a", "b"]);
    expect(() => verifiedProductIds([{ id: "a", organization_id: "other" }],
      "id", "organization_id", "org")).toThrow();
    expect(() => verifiedProductIds([], "id", "organization_id", "org")).toThrow();
  });
  it("accepts only provider-issued Polar cents", () => {
    expect(verifiedPolarRevenue({ totals: { revenue: 12345 } })).toBe(12345);
    expect(() => verifiedPolarRevenue({ totals: { revenue: "12345" } })).toThrow();
    expect(() => verifiedPolarRevenue({ totals: { revenue: -1 } })).toThrow();
  });
  it("does not count pending, refunded, disputed, foreign-currency or out-of-scope Dodo payments", () => {
    const good = { brand_id: "brand", created_at: "2026-10-10T12:00:00Z",
      status: "succeeded", currency: "USD", total_amount: 3900,
      refund_status: null, dispute_status: null };
    expect(verifiedDodoPaidVolume([good, { ...good, status: "failed", total_amount: 100 }],
      "brand", period)).toBe(3900);
    for (const bad of [{ brand_id: "other" }, { currency: "EUR" },
      { refund_status: "partial" }, { dispute_status: "open" },
      { created_at: "2026-09-11T00:00:00Z" }, { total_amount: NaN }]) {
      expect(() => verifiedDodoPaidVolume([{ ...good, ...bad }], "brand", period)).toThrow();
    }
  });
});
