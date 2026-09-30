import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "@/test/MemoryRouter";
import type { Tables } from "@/integrations/supabase/types";
import { RankedAppRow, StandardAppCard } from "./MarketplaceCards";

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
  it("keeps no-media New cards compact and Rising as a ranked row", async () => {
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
            <RankedAppRow app={app} rank={1} eyebrow="Launch activity" />
          </MemoryRouter>,
        );
      });
      const card = container.querySelector("article");
      expect(card?.querySelectorAll("img")).toHaveLength(1);
      expect(card?.querySelector(".h-28")).not.toBeNull();
      expect(container.textContent).toContain("1Sample app");
      expect(container.textContent).toContain("Productivity · Launch activity");
    } finally {
      await act(async () => root.unmount());
      container.remove();
      vi.unstubAllGlobals();
    }
  });
});
