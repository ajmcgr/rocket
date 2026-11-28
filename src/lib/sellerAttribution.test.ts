import { beforeEach, describe, expect, it, vi } from "vitest";
import { adoptSellerAnalyticsHandoff, classifySellerVisit, sellerAnalyticsHandoff,
  sellerAttribution, sellerShareUrl } from "./sellerAttribution";
import { emptySellListingDraft, readPendingSignupDraftForEmail, savePendingSignupDraft } from "./sellListingDraft";

const persisted = new Map<string, string>();
beforeEach(() => {
  sessionStorage.clear(); persisted.clear();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => persisted.get(key) ?? null,
    setItem: (key: string, value: string) => persisted.set(key, value),
    removeItem: (key: string) => persisted.delete(key),
  });
});

describe("seller attribution", () => {
  it("classifies the requested campaign sources without retaining arbitrary query values", () => {
    expect(classifySellerVisit(new URL("https://tryrocket.ai/sell"), "https://www.google.com/search?q=private"))
      .toEqual({ source: "organic_search", campaign: "none" });
    expect(classifySellerVisit(new URL("https://tryrocket.ai/sell?utm_source=x&utm_campaign=rocket_valuation_card&email=secret")))
      .toEqual({ source: "x", campaign: "valuation_card" });
    expect(classifySellerVisit(new URL("https://tryrocket.ai/sell?utm_source=rocket_developer_outreach&utm_campaign=rocket_seller_claim_a")))
      .toEqual({ source: "developer_outreach", campaign: "seller_claim_a" });
    expect(classifySellerVisit(new URL("https://tryrocket.ai/sell?utm_source=rocket_partner")))
      .toEqual({ source: "distribution_partner", campaign: "none" });
    expect(classifySellerVisit(new URL("https://tryrocket.ai/sell?utm_source=rocket_backlink")))
      .toEqual({ source: "backlink_campaign", campaign: "none" });
  });

  it("attributes valuation card visits through a social campaign link", () => {
    const url = new URL(sellerShareUrl("linkedin"));
    expect(classifySellerVisit(url)).toEqual({ source: "linkedin", campaign: "valuation_card" });
  });

  it("restores analytics only from an email-matched signup draft and never stores financial inputs", () => {
    const draft = { ...emptySellListingDraft, appName: "Test", appUrl: "https://example.com",
      contactEmail: "seller@example.com", price: "90000", valuationInputs: {
        currency: "USD" as const, businessModel: "saas" as const,
        mrr: 1000, monthlyTraffic: 10, monthlyRevenueGrowthPct: 0, ageMonths: 1 } };
    const sessionId = crypto.randomUUID();
    adoptSellerAnalyticsHandoff({ sessionId, source: "x", campaign: "valuation_card" });
    savePendingSignupDraft(draft);
    expect(readPendingSignupDraftForEmail("other@example.com")).toBeNull();
    const handoff = readPendingSignupDraftForEmail("seller@example.com");
    expect(handoff?.analytics).toEqual({ sessionId, source: "x", campaign: "valuation_card" });
    expect(JSON.parse(localStorage.getItem("rocket:sell-pending-signup-draft-v1") || "null").draft.valuationInputs).toBeNull();
    sessionStorage.clear();
    adoptSellerAnalyticsHandoff(handoff?.analytics);
    expect(sellerAnalyticsHandoff()).toEqual({ sessionId, source: "x", campaign: "valuation_card" });
    expect(sellerAttribution()).toEqual({ source: "x", campaign: "valuation_card" });
    expect(sessionStorage.getItem("rocket:sell-journey")).toBe("1");
  });

  it("rejects malformed handoff data", () => {
    adoptSellerAnalyticsHandoff({ sessionId: crypto.randomUUID(), source: "secret", campaign: "none" });
    expect(sessionStorage.getItem("rocket:seller-attribution-v1")).toBeNull();
  });
});
