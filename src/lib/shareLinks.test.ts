import { describe, expect, it } from "vitest";
import { attributedShareUrl, canonicalShareUrl, shareCardUrl, shareTargets } from "./shareLinks";

describe("Rocket sharing links", () => {
  it("keeps the indexable app URL clean while attributing shared visits", () => {
    expect(canonicalShareUrl("app", "launch")).toBe("https://tryrocket.ai/apps/launch");
    const share = new URL(attributedShareUrl("app", "launch"));
    expect(share.pathname).toBe("/apps/launch");
    expect(share.searchParams.get("utm_source")).toBe("rocket_share");
    expect(share.searchParams.get("utm_content")).toBe("card_20261014");
  });
  it("generates one image endpoint with the requested dimensions variant", () => {
    const image = new URL(shareCardUrl("app", "launch", "portrait", "v2"));
    expect(image.searchParams.get("variant")).toBe("portrait");
    expect(image.searchParams.get("v")).toBe("b4v2");
  });
  it("uses supported intent URLs without suggesting a post was published", () => {
    const targets = shareTargets("Launch", canonicalShareUrl("app", "launch"));
    expect(new URL(targets.linkedin).searchParams.get("url")).toBe("https://tryrocket.ai/apps/launch");
    expect(new URL(targets.x).searchParams.get("text")).toContain("Launch");
    expect(targets.reddit).toContain("/submit?");
    expect(shareTargets("@alex", "https://tryrocket.ai/@alex", "profile").caption).toContain("Find @alex");
    expect(shareTargets("Rocket 100 member #001", "https://tryrocket.ai/@alex", "rocket100").caption).toBe("I'm in the Rocket 100.\n\nhttps://tryrocket.ai/@alex");
  });
});
