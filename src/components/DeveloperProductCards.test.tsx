import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "@/test/MemoryRouter";
import DeveloperProductCards from "./DeveloperProductCards";

describe("Developer product cards", () => {
  it.each([undefined, "app-1"])("keeps setup links scoped to %s", async (appId) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("scrollTo", vi.fn());
    const container = document.createElement("div");
    const root = createRoot(container);
    try {
      await act(async () => { root.render(<MemoryRouter><DeveloperProductCards appId={appId} /></MemoryRouter>); });
      const suffix = appId ? `?app=${appId}` : "";
      expect(container.querySelector(`a[href="/buy-with-rocket${suffix}"]`)?.textContent).toContain("Start selling");
      expect(container.querySelector(`a[href="/rocket-id${suffix}"]`)?.textContent).toContain("Set up Rocket ID");
      expect(container.querySelectorAll("article")).toHaveLength(2);
      expect(container.textContent).toContain("5% platform fee");
      expect(container.textContent).toContain("Stripe processing fees separate");
      expect(container.textContent).toContain("Verified app ownership");
      expect(container.textContent).toContain("$99/year");
    } finally {
      await act(async () => { root.unmount(); });
      vi.unstubAllGlobals();
    }
  });
});
