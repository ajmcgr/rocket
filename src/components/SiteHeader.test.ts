import { describe, expect, it } from "vitest";
import { isMarketplaceSidebarItemActive } from "./SiteHeader";

describe("marketplace sidebar active state", () => {
  it("does not select Revenue on the pricing overview", () => {
    expect(isMarketplaceSidebarItemActive("Revenue", "/your-apps", "/pricing", "")).toBe(false);
  });

  it("still selects actual page destinations", () => {
    expect(isMarketplaceSidebarItemActive("Discover", "/discover", "/discover", "")).toBe(true);
    expect(isMarketplaceSidebarItemActive("Rankings", "/discover?view=rankings", "/discover", "?view=rankings")).toBe(true);
    expect(isMarketplaceSidebarItemActive("Rocket ID", "/developer#rocket-id", "/developer/apps", "")).toBe(false);
    expect(isMarketplaceSidebarItemActive("Developer", "/developer", "/developer/apps", "")).toBe(true);
  });
});
