import { describe, expect, it, vi } from "vitest";
import {
  publicShareMetrics,
  loadPublicShareMetrics,
} from "../../supabase/functions/_shared/publicShareMetrics";
const now = Date.parse("2026-10-24T09:00:00Z");
const traffic = (visibility = "exact") => ({
  visibility,
  value: 12500,
  value_range: "10K–99.9K",
  provider: "ga4",
  metric_type: "active_users",
  metric_date: "2026-10-23",
  last_verified_at: "2026-10-24T08:00:00Z",
});
const revenue = (visibility = "exact") => ({
  visibility,
  mrr_minor: 123400,
  range_lower_minor: 100000,
  range_upper_minor: 200000,
  currency: "usd",
  provider: "stripe",
  metric_type: "mrr",
  last_verified_at: "2026-10-24T08:00:00Z",
});
describe("Share card public evidence", () => {
  it("prioritizes verified revenue, then traffic, with source/date and correct units", () => {
    const values = publicShareMetrics([traffic()], [revenue()], [], now);
    expect(values.map((m) => m.label)).toEqual([
      "Monthly recurring revenue",
      "Daily active users",
    ]);
    expect(values[0].value).toBe("$1,234.00");
    expect(values[1].value).toBe("12.5K");
    expect(values[0].source).toContain("Stripe");
  });
  it("shows verification without exposing private values", () => {
    expect(
      publicShareMetrics(
        [traffic("private")],
        [revenue("verified_only")],
        [],
        now,
      ),
    ).toEqual([
      {
        label: "Monthly recurring revenue",
        value: "Verified",
        source: "Stripe · 2026-10-24",
      },
    ]);
    expect(
      publicShareMetrics([traffic("verified_only")], [], [], now)[0].value,
    ).toBe("Verified");
    expect(
      publicShareMetrics(
        [],
        [
          {
            ...revenue("verified_only"),
            revenue_scope: "account",
            mrr_minor: null,
          },
        ],
        [],
        now,
      )[0].label,
    ).toBe("Stripe account MRR");
  });
  it("never includes private values, stale records, or conflicting providers", () => {
    expect(
      publicShareMetrics([traffic("private")], [revenue("private")], [], now),
    ).toEqual([]);
    expect(
      publicShareMetrics(
        [],
        [{ ...revenue(), last_verified_at: "2026-10-15" }],
        [],
        now,
      ),
    ).toEqual([]);
    expect(
      publicShareMetrics(
        [],
        [revenue()],
        [{ ...revenue(), provider: "revenuecat" }],
        now,
      ),
    ).toEqual([]);
    expect(
      publicShareMetrics(
        [],
        [{ ...revenue(), visibility: "exact", mrr_minor: null }],
        [],
        now,
      ),
    ).toEqual([]);
  });
  it("keeps ranges redacted and distinguishes gross revenue from MRR", () => {
    expect(
      publicShareMetrics([traffic("range")], [revenue("range")], [], now).map(
        (m) => m.value,
      ),
    ).toEqual(["$1,000.00–$2,000.00", "10K–99.9K"]);
    const alt = {
      ...revenue(),
      metric_type: "gross_revenue_30d",
      provider: "revenuecat",
      value_minor: 1200,
    };
    expect(publicShareMetrics([], [], [alt], now)[0].label).toBe(
      "Gross revenue · 30 days",
    );
  });
  it("queries only anonymous public projections and fails closed on read errors", async () => {
    const from = vi.fn(() => ({
      select: () => ({ eq: async () => ({ data: [], error: null }) }),
    }));
    expect(await loadPublicShareMetrics({ from }, "app")).toEqual([]);
    expect(from.mock.calls.map((c) => c[0])).toEqual([
      "public_app_traction",
      "public_app_revenue",
      "public_app_verified_revenue",
    ]);
    const bad = {
      from: () => ({
        select: () => ({
          eq: async () => ({ data: null, error: new Error("denied") }),
        }),
      }),
    };
    expect(await loadPublicShareMetrics(bad, "app")).toEqual([]);
  });
});
