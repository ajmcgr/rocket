import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "@/test/MemoryRouter";
import { describe, expect, it, vi } from "vitest";
import { MobilePrimaryNav, PrimaryNav, PublicMobileNav } from "./PrimaryNav";

describe("platform primary navigation", () => {
  it("keeps desktop destinations and exposes search/account on mobile", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    try {
      await act(async () => {
        root.render(
          <MemoryRouter initialEntries={["/launch"]}>
            <PrimaryNav />
            <MobilePrimaryNav />
          </MemoryRouter>,
        );
      });
      const expected = [
        ["Discover", "Saved", "Your Apps", "Launch", "Create"],
        ["Discover", "Search", "Saved", "Launch", "Your Apps", "Account"],
      ];
      [...container.querySelectorAll("nav")].forEach((nav, index) => {
        expect(
          [...nav.querySelectorAll("a")].map((link) =>
            link.textContent?.trim(),
          ),
        ).toEqual(expected[index]);
        expect(
          nav.querySelector('a[href="/launch"]')?.getAttribute("aria-current"),
        ).toBe("page");
      });
    } finally {
      await act(async () => root.unmount());
      container.remove();
      vi.unstubAllGlobals();
    }
  });

  it("keeps public mobile discovery and launch visible with auth return destinations", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    try {
      await act(async () => {
        root.render(
          <MemoryRouter initialEntries={["/discover"]}>
            <PublicMobileNav />
          </MemoryRouter>,
        );
      });
      expect(
        [...container.querySelectorAll("nav a")].map((link) =>
          link.textContent?.trim(),
        ),
      ).toEqual([
        "Discover",
        "Search",
        "Saved",
        "Launch",
        "Your Apps",
        "Account",
      ]);
      expect(
        container
          .querySelector('a[href="/discover"]')
          ?.getAttribute("aria-current"),
      ).toBe("page");
    } finally {
      await act(async () => root.unmount());
      container.remove();
      vi.unstubAllGlobals();
    }
  });
});
