import { describe, expect, it } from "vitest";
import { outboundWebsiteUrl } from "./outboundLinks";

describe("outbound attribution", () => {
  it("adds organic Rocket attribution before the fragment", () => {
    expect(outboundWebsiteUrl("https://example.com/pricing#plans")).toBe("https://example.com/pricing?utm_source=rocket&utm_medium=referral&utm_campaign=app_listing#plans");
  });
  it("preserves the original encoded query and advertiser tracking", () => {
    const original = "https://example.com/?signature=a%20b%2fc&item=one&item=two&utm_source=advertiser&utm_medium=cpc&utm_campaign=custom&utm_content=creative#buy";
    expect(outboundWebsiteUrl(original, { campaign: "featured_app", content: "homepage" })).toBe(original);
    expect(outboundWebsiteUrl("https://example.com/?q=a%20b%2fc#buy")).toBe("https://example.com/?q=a%20b%2fc&utm_source=rocket&utm_medium=referral&utm_campaign=app_listing#buy");
  });
  it.each(["featured_app", "category_sponsor"] as const)("identifies %s as display advertising", (campaign) => {
    const url = new URL(outboundWebsiteUrl("https://example.com/", { campaign, content: "footer" }));
    expect(Object.fromEntries(url.searchParams)).toEqual({ utm_source: "rocket", utm_medium: "display", utm_campaign: campaign, utm_content: "footer" });
  });
  it("does not duplicate tags or discard empty merchant parameters", () => {
    const first = outboundWebsiteUrl("https://example.com/?utm_source=&coupon=SAVE&");
    expect(first).toContain("?utm_source=&coupon=SAVE&utm_medium=referral");
    expect(outboundWebsiteUrl(first)).toBe(first);
  });
  it.each(["/apps/launch", "mailto:hello@example.com", "not a url"])("does not append campaign tags to %s", (value) => {
    expect(outboundWebsiteUrl(value)).toBe(value);
  });
});
