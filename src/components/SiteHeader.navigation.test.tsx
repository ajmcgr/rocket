import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "@/test/MemoryRouter";
import SiteHeader from "./SiteHeader";

const auth = vi.hoisted(() => ({ user: null as null | { email: string } }));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: auth.user, loading: false, signOut: vi.fn() }),
}));
vi.mock("./LanguageSelector", () => ({ default: () => null }));
vi.mock("./ThemeToggle", () => ({ default: () => null }));
vi.mock("./Logo", () => ({ default: () => null }));
vi.mock("@/hooks/useMyProfileHref", () => ({ useMyProfileHref: () => "/settings/profile" }));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Create sidebar destinations", () => {
  it("places the collapse control in the logo row and keeps expansion available", async () => {
    vi.stubGlobal("scrollTo", vi.fn());
    vi.stubGlobal("localStorage", { getItem: vi.fn(() => null), setItem: vi.fn() });
    auth.user = null;
    render(<MemoryRouter initialEntries={["/"]}><SiteHeader /></MemoryRouter>);
    const collapse = await screen.findByRole("button", { name: "Collapse sidebar" });
    expect(collapse.parentElement?.className).toContain("h-[65px]");
    expect(collapse.closest("nav")).toBeNull();
    fireEvent.click(collapse);
    expect(screen.getByRole("button", { name: "Expand sidebar" }).className).toContain("left-full");
    fireEvent.click(screen.getByRole("button", { name: "Expand sidebar" }));
    expect(screen.getByRole("button", { name: "Collapse sidebar" })).toBeTruthy();
  });
  for (const signedIn of [false, true]) {
    for (const path of ["/", "/discover", "/pricing", "/submit"]) {
      it(`keeps Brand Studio without a duplicate Saved Designs link on ${path} when ${signedIn ? "signed in" : "signed out"}`, async () => {
        vi.stubGlobal("scrollTo", vi.fn());
        vi.stubGlobal("localStorage", { getItem: vi.fn(() => null), setItem: vi.fn() });
        auth.user = signedIn ? { email: "owner@example.com" } : null;
        render(<MemoryRouter initialEntries={[path]}><SiteHeader /></MemoryRouter>);
        expect((await screen.findByRole("link", { name: "Brand Studio" })).getAttribute("href")).toBe("/create");
        expect(screen.queryByRole("link", { name: "Saved Designs" })).toBeNull();
        expect(screen.queryByText("Logos/Icons")).toBeNull();
        const apps = screen.getAllByRole("link", { name: "My Apps" })[0];
        const subscriptions = screen.getByRole("link", { name: "My Purchases" });
        expect(subscriptions.getAttribute("href")).toBe("/library");
        expect(apps.compareDocumentPosition(subscriptions) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(screen.queryByRole("link", { name: "Library" })).toBeNull();
      });
    }
  }
});
