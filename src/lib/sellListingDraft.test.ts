import { describe, expect, it } from "vitest";
import { sameAppWebsite, validSellListingIdentity, emptySellListingDraft } from "./sellListingDraft";

describe("sale listing drafts", () => {
  it("accepts a public HTTPS app identity before sign-up", () => {
    expect(validSellListingIdentity({ ...emptySellListingDraft, appName: "Launch", appUrl: "https://trylaunch.ai/" })).toBe(true);
    expect(validSellListingIdentity({ ...emptySellListingDraft, appName: "Launch", appUrl: "http://trylaunch.ai/" })).toBe(false);
  });

  it("matches the same app across www and tracking query variants", () => {
    expect(sameAppWebsite("https://www.trylaunch.ai/", "https://trylaunch.ai/?utm_source=rocket")).toBe(true);
    expect(sameAppWebsite("https://trylaunch.ai/app-one", "https://trylaunch.ai/app-two")).toBe(false);
  });
});
