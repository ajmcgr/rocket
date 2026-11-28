import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearLocalSellListingDrafts, clearPendingSignupDraft, draftBelongsToUser, emptySellListingDraft, readAccountSellListingDraft,
  readPendingSignupDraftForEmail, readSellListingDraftForEmail, sameAppWebsite, saveAccountSellListingDraft,
  savePendingSignupDraft, saveSellListingDraft, validSellListingIdentity } from "./sellListingDraft";

const persistent = new Map<string, string>();
beforeEach(() => {
  persistent.clear(); sessionStorage.clear();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => persistent.get(key) ?? null,
    setItem: (key: string, value: string) => persistent.set(key, value),
    removeItem: (key: string) => persistent.delete(key),
    clear: () => persistent.clear(),
  });
});

describe("sale listing drafts", () => {
  it("accepts a public HTTPS app identity before sign-up", () => {
    expect(validSellListingIdentity({ ...emptySellListingDraft, appName: "Launch", appUrl: "https://trylaunch.ai/" })).toBe(true);
    expect(validSellListingIdentity({ ...emptySellListingDraft, appName: "Launch", appUrl: "http://trylaunch.ai/" })).toBe(false);
  });

  it("matches the same app across www and tracking query variants", () => {
    expect(sameAppWebsite("https://www.trylaunch.ai/", "https://trylaunch.ai/?utm_source=rocket")).toBe(true);
    expect(sameAppWebsite("https://trylaunch.ai/app-one", "https://trylaunch.ai/app-two")).toBe(false);
  });

  it("restores handoff only to the matching account and omits private valuation inputs from persistent storage", () => {
    const draft = { ...emptySellListingDraft, appName: "Launch", appUrl: "https://trylaunch.ai",
      contactEmail: "founder@example.com", valuationInputs: { currency: "USD" as const, businessModel: "saas" as const,
        mrr: 9000, monthlyTraffic: 1000, monthlyRevenueGrowthPct: 10, ageMonths: 12 } };
    saveSellListingDraft(draft);
    savePendingSignupDraft(draft);
    expect(readSellListingDraftForEmail("other@example.com")).toBeNull();
    expect(readPendingSignupDraftForEmail("other@example.com")).toBeNull();
    expect(readSellListingDraftForEmail("FOUNDER@example.com")?.draft.valuationInputs?.mrr).toBe(9000);
    expect(readPendingSignupDraftForEmail("founder@example.com")?.draft.valuationInputs).toBeNull();
    expect(localStorage.getItem("rocket:sell-pending-signup-draft-v1")).not.toContain("9000");
    clearPendingSignupDraft();
    expect(readPendingSignupDraftForEmail("founder@example.com")).toBeNull();
  });

  it("scopes signed-in browser caches by user ID and expires old drafts", () => {
    const draft = { ...emptySellListingDraft, appName: "Launch", contactEmail: "a@example.com" };
    saveAccountSellListingDraft("user-a", draft);
    expect(readAccountSellListingDraft("user-b")).toBeNull();
    expect(readAccountSellListingDraft("user-a")?.draft.appName).toBe("Launch");
    expect(draftBelongsToUser(draft, "b@example.com")).toBe(false);
    sessionStorage.setItem("rocket:sell-account-draft-v1:user-a", JSON.stringify({ draft, savedAt: Date.now() - 25 * 60 * 60 * 1000 }));
    expect(readAccountSellListingDraft("user-a")).toBeNull();
  });

  it("clears every local seller draft on sign out", () => {
    const draft = { ...emptySellListingDraft, appName: "Private Startup", contactEmail: "founder@example.com" };
    saveSellListingDraft(draft);
    saveAccountSellListingDraft("user-a", draft);
    savePendingSignupDraft(draft);
    clearLocalSellListingDrafts();
    expect(readAccountSellListingDraft("user-a")).toBeNull();
    expect(readSellListingDraftForEmail("founder@example.com")).toBeNull();
    expect(readPendingSignupDraftForEmail("founder@example.com")).toBeNull();
  });
});
