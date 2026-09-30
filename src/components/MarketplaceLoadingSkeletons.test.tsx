import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  AppProfileRouteSkeleton,
  RankedAppRowSkeleton,
  SavedAppsRouteSkeleton,
} from "./MarketplaceLoadingSkeletons";

describe("marketplace loading states", () => {
  it("matches the app profile structure instead of showing a generic card grid", () => {
    const html = renderToStaticMarkup(<AppProfileRouteSkeleton />);
    expect(html).toContain('aria-label="Loading app profile"');
    expect(html).toContain("max-w-6xl");
    expect(html).toContain("h-20 w-20");
    expect(html).toContain("h-48 w-");
  });

  it("matches saved app cards and ranking rows", () => {
    const saved = renderToStaticMarkup(<SavedAppsRouteSkeleton />);
    const ranked = renderToStaticMarkup(<RankedAppRowSkeleton />);
    expect(saved).toContain('aria-label="Loading saved apps"');
    expect(saved.match(/min-h-52/g)).toHaveLength(4);
    expect(ranked).toContain("min-h-20");
    expect(ranked).toContain("h-11 w-11");
  });
});
