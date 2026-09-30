import { describe, expect, it } from "vitest";
import { signalExplanation, signalLabel, type AppSignal } from "./appIntelligence";

const signal: AppSignal = {
  app_id: "app", signal_type: "rising", evidence_source: "launch", net_votes: 7,
  age_band: "8-30", cohort_category: "Productivity", cohort_size: 100,
  percentile_rank: 0.96, category_median_votes: 1,
  source_updated_at: "2026-09-29T00:00:00Z", calculated_at: "2026-09-29T01:00:00Z",
  calculation_version: 1,
};

describe("public Launch signal copy", () => {
  it("states its actual evidence and cohort without implying revenue or demand", () => {
    expect(signalLabel(signal)).toBe("Notable Launch activity");
    expect(signalExplanation(signal)).toContain("7 net Launch votes · top 4% of 100 Productivity products");
    expect(signalExplanation(signal)).not.toMatch(/revenue|demand|users/i);
  });
});
