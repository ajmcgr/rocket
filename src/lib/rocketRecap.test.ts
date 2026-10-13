import { describe, expect, it } from "vitest";
import { completedUtcMonth, meaningfulHighlight, monthlyChange, priorMonth, type Recap } from "./rocketRecap";

const recap = (month: string, views: number, clicks: number, coverage: "complete" | "partial" = "complete"): Recap => ({
  month, apps: [], totals: { views, clicks, app_count: 1 }, coverage: { views: coverage, clicks: coverage }, updated_at: "2026-11-02T00:00:00Z",
});

describe("Rocket Recap completed-month rules", () => {
  it("uses the previous completed UTC calendar month at a local timezone boundary", () => {
    expect(completedUtcMonth(new Date("2026-11-01T00:00:00Z"))).toBe("2026-10-01");
    expect(completedUtcMonth(new Date("2027-01-01T00:00:00Z"))).toBe("2026-12-01");
    expect(priorMonth("2027-01-01")).toBe("2026-12-01");
  });
  it("refuses growth comparisons for incomplete history or a zero denominator", () => {
    expect(monthlyChange(recap("2026-11-01", 120, 3), recap("2026-10-01", 100, 2, "partial"), "views")).toBeNull();
    expect(monthlyChange(recap("2026-11-01", 120, 3), recap("2026-10-01", 0, 2), "views")).toBeNull();
    expect(monthlyChange(recap("2026-11-01", 120, 3), recap("2026-10-01", 100, 2), "views")).toBe("+20% vs. last month");
  });
  it("does not manufacture a highlight from trivial or missing activity", () => {
    expect(meaningfulHighlight([])).toBeNull();
    expect(meaningfulHighlight([{ id: "a", slug: "a", name: "A", logo_url: null, views: 3, clicks: 0 }])).toBeNull();
    expect(meaningfulHighlight([{ id: "a", slug: "a", name: "A", logo_url: null, views: 10, clicks: 0 }])?.name).toBe("A");
  });
});
