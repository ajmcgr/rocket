import { describe, expect, it } from "vitest";
import { REVENUECAT_SCOPES, revenueCatAuthorizationUrl, revenuePeriod,
  validateRevenueCatMetric, validateSingleAppProject } from "../../supabase/functions/_shared/revenuecatVerification";

const projectId = "proj1ab2c3d4";
const appId = "app1ab2c3d4";
const apps = [{ id: appId, project_id: projectId }];
const products = [
  { id: "prodabc12345", app_id: appId },
  { id: "prodabc12346", app_id: appId },
];

describe("RevenueCat verified revenue boundaries", () => {
  it("requests only the required read permissions and uses PKCE", () => {
    const url = new URL(revenueCatAuthorizationUrl("client", "https://example.com/callback", "state", "challenge"));
    expect(url.origin).toBe("https://api.revenuecat.com");
    expect(url.searchParams.get("scope")).toBe(REVENUECAT_SCOPES);
    expect(REVENUECAT_SCOPES).not.toContain("read_write");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("state")).toBe("state");
  });

  it("maps only a complete single-app project", () => {
    expect(validateSingleAppProject(projectId, appId, apps, products).productIds)
      .toEqual(["prodabc12345", "prodabc12346"]);
    expect(() => validateSingleAppProject(projectId, appId,
      [...apps, { id: "appother123", project_id: projectId }], products)).toThrow();
    expect(() => validateSingleAppProject(projectId, appId, apps,
      [{ id: "prodother123", app_id: "appother123" }])).toThrow();
    expect(() => validateSingleAppProject(projectId, appId, apps, [])).toThrow();
  });

  it("uses complete UTC days and accepts only matching provider revenue definitions", () => {
    const period = revenuePeriod(new Date("2026-10-09T23:59:00Z"));
    expect(period).toEqual({ start: "2026-09-09", end: "2026-10-08" });
    const response = { object: "revenue_metric", revenue_type: "revenue", currency: "USD",
      start_date: period.start, end_date: period.end, value: 129.25 };
    expect(validateRevenueCatMetric(response, period.start, period.end).valueMinor).toBe(12925);
    expect(() => validateRevenueCatMetric({ ...response, revenue_type: "proceeds" },
      period.start, period.end)).toThrow();
    expect(() => validateRevenueCatMetric({ ...response, currency: "EUR" },
      period.start, period.end)).toThrow();
    expect(() => validateRevenueCatMetric({ ...response, end_date: "2026-10-09" },
      period.start, period.end)).toThrow();
  });
});
