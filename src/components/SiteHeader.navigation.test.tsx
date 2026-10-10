import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "@/test/MemoryRouter";
import SiteHeader from "./SiteHeader";

const auth = vi.hoisted(() => ({ user: null as null | { email: string } }));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: auth.user, loading: false, signOut: vi.fn() }),
}));
vi.mock("./LanguageSelector", () => ({ default: () => null }));
vi.mock("./ThemeToggle", () => ({ default: () => null }));
vi.mock("./WorkspaceSwitcher", () => ({
  default: () => <button>Personal workspace</button>,
}));
vi.mock("./NotificationsBell", () => ({
  default: () => <button aria-label="Notifications">Notifications</button>,
}));
vi.mock("./ShareExportModal", () => ({ default: () => null }));
vi.mock("./Logo", () => ({ default: () => null }));
vi.mock("@/hooks/useMyProfileHref", () => ({
  useMyProfileHref: () => "/settings/profile",
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Sidebar destinations", () => {
  it("places the collapse control in the logo row and keeps expansion available", async () => {
    vi.stubGlobal("scrollTo", vi.fn());
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
    });
    auth.user = null;
    render(
      <MemoryRouter initialEntries={["/"]}>
        <SiteHeader />
      </MemoryRouter>,
    );
    const collapse = await screen.findByRole("button", {
      name: "Collapse sidebar",
    });
    expect(collapse.parentElement?.className).toContain("h-[65px]");
    expect(collapse.closest("nav")).toBeNull();
    fireEvent.click(collapse);
    expect(
      screen.getByRole("button", { name: "Expand sidebar" }).className,
    ).toContain("left-full");
    fireEvent.click(screen.getByRole("button", { name: "Expand sidebar" }));
    expect(
      screen.getByRole("button", { name: "Collapse sidebar" }),
    ).toBeTruthy();
  });
  for (const signedIn of [false, true]) {
    for (const path of ["/", "/discover", "/pricing", "/submit"]) {
      it(`shows the right sidebar sections on ${path} when ${signedIn ? "signed in" : "signed out"}`, async () => {
        vi.stubGlobal("scrollTo", vi.fn());
        vi.stubGlobal("localStorage", {
          getItem: vi.fn(() => null),
          setItem: vi.fn(),
        });
        auth.user = signedIn ? { email: "owner@example.com" } : null;
        render(
          <MemoryRouter initialEntries={[path]}>
            <SiteHeader />
          </MemoryRouter>,
        );
        const appsHeading = await screen.findByText("Apps");
        const sidebar = within(appsHeading.closest("aside")!);
        if (signedIn) {
          const apps = sidebar.getByRole("link", { name: "My Apps" });
          const purchases = sidebar.getByRole("link", { name: "My Purchases" });
          expect(sidebar.getByRole("link", { name: "Saved" })).toBeTruthy();
          expect(purchases.getAttribute("href")).toBe("/library");
          expect(
            apps.compareDocumentPosition(purchases) &
              Node.DOCUMENT_POSITION_FOLLOWING,
          ).toBeTruthy();
          expect(
            (
              await sidebar.findByRole("link", { name: "Brand Studio" })
            ).getAttribute("href"),
          ).toBe("/create");
          expect(sidebar.getByText("Monetize")).toBeTruthy();
          expect(sidebar.getByText("Create")).toBeTruthy();
        } else {
          for (const label of ["My Apps", "My Purchases", "Saved"]) {
            expect(sidebar.queryByRole("link", { name: label })).toBeNull();
          }
          expect(sidebar.getByRole("link", { name: "Submit my app" })).toBeTruthy();
          expect(
            sidebar.queryByRole("link", { name: "Brand Studio" }),
          ).toBeNull();
          expect(
            sidebar.queryByRole("link", { name: "Buy with Rocket" }),
          ).toBeNull();
          expect(sidebar.queryByRole("link", { name: "Rocket ID" })).toBeNull();
          expect(sidebar.queryByText("Monetize")).toBeNull();
          expect(sidebar.queryByText("Create")).toBeNull();
        }
        expect(
          sidebar.queryByRole("link", { name: "Saved Designs" }),
        ).toBeNull();
        expect(sidebar.queryByText("Logos/Icons")).toBeNull();
        expect(sidebar.queryByRole("link", { name: "Library" })).toBeNull();
      });
    }
  }
});
