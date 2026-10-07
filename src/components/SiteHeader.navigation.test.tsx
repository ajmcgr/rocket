import { cleanup, render, screen } from "@testing-library/react";
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
