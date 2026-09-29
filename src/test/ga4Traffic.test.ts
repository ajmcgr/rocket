import { describe, expect, it } from "vitest";
import { completePeriodGrowth, dailyMetricPoints, hostnameFromStream, matchingStreamHost } from "../../supabase/functions/_shared/ga4Traffic";

describe("GA4 traffic verification helpers", () => {
  it("accepts only the verified app host, including its www alias", () => {
    expect(matchingStreamHost("example.com", "https://www.example.com/")).toBe(true);
    expect(matchingStreamHost("example.com", "https://other.com/")).toBe(false);
    expect(matchingStreamHost("example.com", "https://example.com.attacker.test/")).toBe(false);
    expect(hostnameFromStream("javascript:alert(1)")).toBeNull();
  });
  it("fills absent complete dates with zero and preserves separate Google metric definitions", () => {
    expect(dailyMetricPoints([{ dimensionValues: [{ value: "20260928" }],
      metricValues: [{ value: "3" }, { value: "4" }, { value: "9" }] }], "2026-09-27", "2026-09-28"))
      .toEqual([
        { metric_date: "2026-09-27", metric_type: "active_users", metric_value: 0 },
        { metric_date: "2026-09-27", metric_type: "sessions", metric_value: 0 },
        { metric_date: "2026-09-27", metric_type: "views", metric_value: 0 },
        { metric_date: "2026-09-28", metric_type: "active_users", metric_value: 3 },
        { metric_date: "2026-09-28", metric_type: "sessions", metric_value: 4 },
        { metric_date: "2026-09-28", metric_type: "views", metric_value: 9 },
      ]);
  });
  it("rejects malformed or duplicated provider dates", () => {
    const row = { dimensionValues: [{ value: "20260928" }], metricValues: [{ value: "1" }, { value: "1" }, { value: "1" }] };
    expect(() => dailyMetricPoints([row, row], "2026-09-28", "2026-09-28")).toThrow();
    expect(() => dailyMetricPoints([{ ...row, metricValues: [{ value: "-1" }, { value: "1" }, { value: "1" }] }], "2026-09-28", "2026-09-28")).toThrow();
  });
  it("calculates change only when both comparable periods contain every day", () => {
    const points = Array.from({ length: 14 }, (_, index) => ({
      metric_date: new Date(Date.UTC(2026, 8, 15 + index)).toISOString().slice(0, 10),
      metric_value: index < 7 ? 10 : 20,
    }));
    expect(completePeriodGrowth(points, "2026-09-28", 7)).toBe(100);
    expect(completePeriodGrowth(points.slice(1), "2026-09-28", 7)).toBeNull();
  });
});
