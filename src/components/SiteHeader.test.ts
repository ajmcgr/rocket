import { describe, expect, it } from "vitest";
import { isMarketplaceSidebarItemActive } from "./SiteHeader";

describe("marketplace sidebar active state", () => {
  it("does not select Buy with Rocket on the pricing overview", () => {
    expect(isMarketplaceSidebarItemActive("Buy with Rocket", "/pricing#buy-with-rocket", "/pricing", "")).toBe(false);
  });

  it("still selects actual page destinations", () => {
    expect(isMarketplaceSidebarItemActive("Discover", "/discover", "/discover", "")).toBe(true);
    expect(isMarketplaceSidebarItemActive("Rankings", "/discover?view=rankings", "/discover", "?view=rankings")).toBe(true);
    expect(isMarketplaceSidebarItemActive("Rocket ID", "/developer", "/developer/apps", "")).toBe(true);
  });
});
