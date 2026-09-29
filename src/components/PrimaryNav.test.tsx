import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { MobilePrimaryNav, PrimaryNav, PublicMobileNav } from "./PrimaryNav";

describe("platform primary navigation", () => {
  it("presents exactly five destinations on desktop and mobile", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    try {
      await act(async () => { root.render(<MemoryRouter initialEntries={["/launch"]}><PrimaryNav /><MobilePrimaryNav /></MemoryRouter>); });
      const expected = ["Discover", "Saved", "Your Apps", "Launch", "Create"];
      for (const nav of container.querySelectorAll("nav")) {
        expect([...nav.querySelectorAll("a")].map((link) => link.textContent?.trim())).toEqual(expected);
        expect(nav.querySelector('a[href="/launch"]')?.getAttribute("aria-current")).toBe("page");
      }
    } finally {
      await act(async () => root.unmount());
      container.remove();
      vi.unstubAllGlobals();
    }
  });

  it("keeps public mobile discovery and launch visible without signed-in destinations", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    try {
      await act(async () => { root.render(<MemoryRouter initialEntries={["/discover"]}><PublicMobileNav /></MemoryRouter>); });
      expect([...container.querySelectorAll("nav a")].map((link) => link.textContent?.trim())).toEqual(["Discover", "Launch", "Sign in"]);
      expect(container.querySelector('a[href="/discover"]')?.getAttribute("aria-current")).toBe("page");
    } finally {
      await act(async () => root.unmount());
      container.remove();
      vi.unstubAllGlobals();
    }
  });
});
