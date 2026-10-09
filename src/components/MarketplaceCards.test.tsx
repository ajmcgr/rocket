import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "@/test/MemoryRouter";
import type { Tables } from "@/integrations/supabase/types";
import {
  AppCardByline,
  AppCardRating,
  EditorialAppCard,
  MarketplaceListRow,
  RankedAppRow,
  RisingAppCard,
  StandardAppCard,
} from "./MarketplaceCards";
import TrendArrow from "./TrendArrow";
import { renderToStaticMarkup } from "react-dom/server";
import { cleanup, render, screen } from "@testing-library/react";

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
  it("supports bookmark controls in every marketplace layout", async () => {
    const controls = { saved: true, onSave: vi.fn() };
    render(
      <MemoryRouter>
        <StandardAppCard app={app} {...controls} />
        <EditorialAppCard app={app} {...controls} />
        <RankedAppRow app={app} rank={1} {...controls} />
        <RisingAppCard app={app} rank={1} {...controls} />
        <MarketplaceListRow app={app} {...controls} />
      </MemoryRouter>,
    );
    const buttons = await screen.findAllByRole("button", {
      name: "Manage saved app",
    });
    expect(buttons).toHaveLength(5);
    for (const button of buttons) {
      expect(button.getAttribute("aria-pressed")).toBe("true");
      expect(button.textContent).toBe("");
    }
    cleanup();
  });
  it("shows only authoritative card counts and an owner-provided handle", () => {
    expect(renderToStaticMarkup(<AppCardByline />)).toBe("");
    const markup = renderToStaticMarkup(
      <AppCardByline
        metadata={{
          app_id: app.id,
          save_count: 27,
          rating_count: 3,
          developer_handle: "maker",
        }}
      />,
    );
    expect(markup).not.toContain("@maker"); // Unbacked presentation handles are not canonical attribution.
    expect(markup).toContain("27 saves");
    expect(markup).not.toContain("3 ratings");
    const rating = renderToStaticMarkup(
      <AppCardRating
        metadata={{
          app_id: app.id,
          save_count: 27,
          rating_count: 3,
          average_rating: 4.3,
          developer_handle: "maker",
        }}
      />,
    );
    expect(rating).toContain("4.3 out of 5 stars from 3 ratings");
    expect(rating).toContain("★");
    expect(renderToStaticMarkup(<AppCardRating />)).toBe("");
  });
  it("omits unknown pricing while retaining an owner-declared price", () => {
    const metadata = {
      app_id: app.id,
      save_count: 2,
      rating_count: 0,
      pricing_kind: "unknown",
    };
    const unknown = renderToStaticMarkup(<AppCardByline metadata={metadata} />);
    expect(unknown).not.toContain("Pricing unknown");
    expect(unknown).toContain("2 saves");
    const declared = renderToStaticMarkup(
      <AppCardByline metadata={{ ...metadata, pricing_kind: "free" }} />,
    );
    expect(declared).toContain("Free · owner declared");
  });
  it("uses colored text arrows only for supplied trend directions", () => {
    expect(renderToStaticMarkup(<TrendArrow direction="up" />)).toContain(
      "text-green-700",
    );
    expect(renderToStaticMarkup(<TrendArrow direction="up" />)).toContain("↑");
    expect(renderToStaticMarkup(<TrendArrow direction="down" />)).toContain(
      "text-red-600",
    );
    expect(renderToStaticMarkup(<TrendArrow direction="down" />)).toContain(
      "↓",
    );
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
      const rising = Array.from(container.querySelectorAll("article")).find(
        (item) => item.className.includes("h-full") && item !== card,
      );
      expect(card?.querySelectorAll("img")).toHaveLength(1);
      expect(card?.className).toContain("border-neutral-200");
      expect(rising?.className).toContain("border-neutral-200");
      expect(
        card
          ?.querySelector("h3")
          ?.parentElement?.parentElement?.querySelector("img"),
      ).not.toBeNull();
      expect(
        rising
          ?.querySelector("h3")
          ?.parentElement?.parentElement?.querySelector("img"),
      ).not.toBeNull();
      expect(card?.querySelector(".h-28")).toBeNull();
      expect(card?.outerHTML).not.toContain("bg-[#f1f4f7]");
      expect(container.textContent).toContain("1Sample app");
      expect(container.textContent).toContain("Productivity · Launch activity");
      expect(container.querySelectorAll('a[href="/apps/app-1"]')).toHaveLength(
        6,
      );
      const viewLinks = Array.from(
        container.querySelectorAll('a[href="/apps/app-1"]'),
      ).filter((link) => link.textContent === "View");
      expect(viewLinks).toHaveLength(3);
      expect(viewLinks[0].className).toContain("bg-transparent");
      expect(viewLinks[0].className).toContain("border-[#167ac6]");
      expect(
        container.querySelectorAll(
          'button[disabled][aria-label^="Buy unavailable"]',
        ),
      ).toHaveLength(0);
    } finally {
      await act(async () => root.unmount());
      container.remove();
      vi.unstubAllGlobals();
    }
  });
});
