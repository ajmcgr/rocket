import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import RoutePendingSkeleton from "./RoutePendingSkeleton";

describe("route pending state", () => {
  it("renders a theme-aware page skeleton without visible loading copy", () => {
    const html = renderToStaticMarkup(<RoutePendingSkeleton />);
    expect(html).toContain('aria-label="Loading page"');
    expect(html).toContain("rocket-skeleton-surface");
    expect(html).toContain("min-h-screen");
    expect(html).not.toContain("Loading Rocket");
  });
});
