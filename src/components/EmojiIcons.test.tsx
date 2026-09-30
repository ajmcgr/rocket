import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ArrowLeft, ArrowRight, ExternalLink, Search } from "./EmojiIcons";

describe("interface icon characters", () => {
  it("uses text arrows for navigation and external links", () => {
    expect(renderToStaticMarkup(<ArrowLeft />)).toContain("←");
    expect(renderToStaticMarkup(<ArrowRight />)).toContain("→");
    expect(renderToStaticMarkup(<ExternalLink />)).toContain("↗");
    expect(renderToStaticMarkup(<ArrowRight />)).not.toContain("➡️");
  });

  it("keeps non-directional interface icons as emoji", () => {
    expect(renderToStaticMarkup(<Search />)).toContain("🔎");
  });
});
