import { describe, expect, it } from "vitest";
import { isMarketplaceSidebarItemActive } from "./SiteHeader";

describe("marketplace sidebar active state", () => {
  it("does not select Buy with Rocket on the pricing overview", () => {
    expect(isMarketplaceSidebarItemActive("Buy with Rocket", "/developer#buy-with-rocket", "/pricing", "")).toBe(false);
  });

  it("still selects actual page destinations", () => {
    expect(isMarketplaceSidebarItemActive("Buy with Rocket", "/buy-with-rocket", "/buy-with-rocket", "")).toBe(true);
    expect(isMarketplaceSidebarItemActive("Rocket ID", "/rocket-id", "/rocket-id", "")).toBe(true);
    expect(isMarketplaceSidebarItemActive("Buy with Rocket", "/buy-with-rocket", "/settings/developer", "")).toBe(false);
    expect(isMarketplaceSidebarItemActive("Discover", "/discover", "/discover", "")).toBe(true);
    expect(isMarketplaceSidebarItemActive("Rankings", "/discover?view=rankings", "/discover", "?view=rankings")).toBe(true);
    expect(isMarketplaceSidebarItemActive("Rocket ID", "/developer#rocket-id", "/developer/apps", "")).toBe(false);
    expect(isMarketplaceSidebarItemActive("Buy with Rocket", "/developer#buy-with-rocket", "/developer", "")).toBe(false);
    expect(isMarketplaceSidebarItemActive("Developer", "/developer", "/developer/apps", "")).toBe(true);
  });
});
