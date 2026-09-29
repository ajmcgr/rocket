import { describe, expect, it } from "vitest";
import { trustLabels, type AppTrust } from "./appTrust";

const evidence = (overrides: Partial<AppTrust> = {}): AppTrust => ({
  app_id: "example", claimed: false, domain_verified: false,
  traffic_verified: false, revenue_verified: false, ...overrides,
});

describe("app trust labels", () => {
  it("does not turn an indexed or Rising app into an endorsement", () => {
    expect(trustLabels(evidence())).toEqual([]);
  });

  it("keeps ownership and metric verification distinct", () => {
    expect(trustLabels(evidence({ claimed: true, domain_verified: true,
      traffic_verified: true, revenue_verified: false })))
      .toEqual(["Claimed", "Domain verified", "Traffic verified"]);
  });

  it("never invents a Connected or Recommended badge", () => {
    expect(trustLabels(evidence({ revenue_verified: true }))).toEqual(["Revenue verified"]);
  });
});
