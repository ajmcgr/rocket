import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "@/test/MemoryRouter";
import { describe, expect, it, vi } from "vitest";
import { MobilePrimaryNav, PrimaryNav, PublicMobileNav } from "./PrimaryNav";

describe("platform primary navigation", () => {
  it("keeps desktop destinations and exposes search/account on mobile", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    window.scrollTo = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    try {
      await act(async () => {
        root.render(
          <MemoryRouter initialEntries={["/submit"]}>
            <PrimaryNav />
            <MobilePrimaryNav />
          </MemoryRouter>,
        );
      });
      const expected = [
        ["Discover", "Collections", "My Collections", "My Apps", "Submit", "Create"],
        ["Discover", "Collections", "My Collections", "Submit", "My Apps", "Account"],
      ];
      [...container.querySelectorAll("nav")].forEach((nav, index) => {
        expect(
          [...nav.querySelectorAll("a")].map((link) =>
            link.getAttribute("aria-label") || link.textContent?.trim(),
          ),
        ).toEqual(expected[index]);
        expect(
          nav.querySelector('a[href="/submit"]')?.getAttribute("aria-current"),
        ).toBe("page");
        expect(nav.querySelector('a[href="/submit"]')?.className).toContain("bg-neutral-200");
      });
      const mobileNav = container.querySelector('nav[aria-label="Mobile primary"]');
      expect(mobileNav?.querySelectorAll("a > svg")).toHaveLength(6);
      expect(mobileNav?.querySelector('a[href="/discover"] svg')?.getAttribute("class")).toContain("lucide-compass");
      expect(mobileNav?.querySelector('a[href="/my-collections"] svg')?.getAttribute("class")).toContain("lucide-bookmark");
      expect(mobileNav?.querySelector('a[href="/your-apps"] svg')?.getAttribute("class")).toContain("lucide-layers");
    } finally {
      await act(async () => root.unmount());
      container.remove();
      vi.unstubAllGlobals();
    }
  });

  it("keeps public mobile discovery and submission visible with auth return destinations", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    window.scrollTo = vi.fn();
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
          link.getAttribute("aria-label") || link.textContent?.trim(),
        ),
      ).toEqual([
        "Discover",
        "Collections",
        "My Collections",
        "Submit",
        "My Apps",
        "Account",
      ]);
      expect(
        container
          .querySelector('a[href="/discover"]')
          ?.getAttribute("aria-current"),
      ).toBe("page");
      expect(container.querySelector('a[href="/discover"]')?.className).toContain("bg-neutral-200");
      expect(container.querySelectorAll('nav[aria-label="Mobile primary"] a > svg')).toHaveLength(6);
    } finally {
      await act(async () => root.unmount());
      container.remove();
      vi.unstubAllGlobals();
    }
  });
});
