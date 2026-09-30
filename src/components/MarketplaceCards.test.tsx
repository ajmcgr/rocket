import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "@/test/MemoryRouter";
import type { Tables } from "@/integrations/supabase/types";
import { RankedAppRow, RisingAppCard, StandardAppCard } from "./MarketplaceCards";
import TrendArrow from "./TrendArrow";
import { renderToStaticMarkup } from "react-dom/server";

const app = {
  id: "app-1",
  name: "Sample app",
  tagline: "A useful independent app",
  description: null,
  canonical_host: "sample.example",
  logo_url: "https://example.com/logo.png",
  categories: ["Productivity"],
} as Tables<"public_apps">;

describe("marketplace content treatments", () => {
  it("uses colored text arrows only for supplied trend directions", () => {
    expect(renderToStaticMarkup(<TrendArrow direction="up" />)).toContain("text-green-700");
    expect(renderToStaticMarkup(<TrendArrow direction="up" />)).toContain("↑");
    expect(renderToStaticMarkup(<TrendArrow direction="down" />)).toContain("text-red-600");
    expect(renderToStaticMarkup(<TrendArrow direction="down" />)).toContain("↓");
  });

  it("shows an unframed icon when media is unavailable and Rising as a ranked row", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    window.scrollTo = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    try {
      await act(async () => {
        root.render(
          <MemoryRouter>
            <StandardAppCard app={app} />
            <RisingAppCard app={app} rank={1} />
            <RankedAppRow app={app} rank={1} eyebrow="Launch activity" />
          </MemoryRouter>,
        );
      });
      const card = container.querySelector("article");
      const rising = Array.from(container.querySelectorAll("article")).find((item) => item.className.includes("h-full") && item !== card);
      expect(card?.querySelectorAll("img")).toHaveLength(1);
      expect(card?.className).toContain("border-neutral-200");
      expect(rising?.className).toContain("border-neutral-200");
      expect(card?.querySelector("h3")?.parentElement?.parentElement?.querySelector("img")).not.toBeNull();
      expect(rising?.querySelector("h3")?.parentElement?.parentElement?.querySelector("img")).not.toBeNull();
      expect(card?.querySelector(".h-28")).toBeNull();
      expect(card?.outerHTML).not.toContain("bg-[#f1f4f7]");
      expect(container.textContent).toContain("1Sample app");
      expect(container.textContent).toContain("Productivity · Launch activity");
      expect(container.querySelectorAll('a[href="/apps/app-1"]')).toHaveLength(6);
      expect(container.querySelectorAll('button[disabled][aria-label^="Buy unavailable"]')).toHaveLength(3);
    } finally {
      await act(async () => root.unmount());
      container.remove();
      vi.unstubAllGlobals();
    }
  });
});
