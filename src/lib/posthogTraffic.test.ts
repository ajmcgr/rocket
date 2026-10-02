import { describe, expect, it } from "vitest";
import {
  posthogOrigin,
  posthogPoints,
  trafficQuery,
} from "../../supabase/functions/_shared/posthogTraffic";
describe("PostHog traffic isolation", () => {
  it("only accepts known cloud regions", () => {
    expect(posthogOrigin("eu")).toBe("https://eu.posthog.com");
    expect(() => posthogOrigin("evil.example")).toThrow();
  });
  it("uses exact app domain and www only with no visitor-level export", () => {
    const q = trafficQuery("www.trymedia.ai");
    expect(q).toContain("IN ('trymedia.ai', 'www.trymedia.ai')");
    expect(q).toContain("LIMIT 90");
    expect(() => trafficQuery("x';DROP TABLE events;--")).toThrow();
  });
  it("parses daily aggregates and fills zero days", () => {
    const p = posthogPoints(
      {
        columns: ["metric_date", "active_users", "sessions", "views"],
        results: [["2026-10-01", 2, 3, 4]],
      },
      "2026-09-30",
      "2026-10-01",
    );
    expect(p).toHaveLength(6);
    expect(p[0].metric_value).toBe(0);
    expect(p[5].metric_value).toBe(4);
  });
  it("rejects truncated, duplicate and unsafe totals", () => {
    const base = {
      columns: ["metric_date", "active_users", "sessions", "views"],
      results: [["2026-10-01", 2, 3, 4]],
    };
    expect(() =>
      posthogPoints({ ...base, hasMore: true }, "2026-10-01", "2026-10-01"),
    ).toThrow();
    expect(() =>
      posthogPoints(
        { ...base, results: [...base.results, ...base.results] },
        "2026-10-01",
        "2026-10-01",
      ),
    ).toThrow();
    expect(() =>
      posthogPoints(
        { ...base, results: [["2026-10-01", -1, 3, 4]] },
        "2026-10-01",
        "2026-10-01",
      ),
    ).toThrow();
  });
});
