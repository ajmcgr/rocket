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

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Create sidebar destinations", () => {
  for (const signedIn of [false, true]) {
    for (const path of ["/", "/discover", "/pricing", "/submit"]) {
      it(`keeps both links on ${path} when ${signedIn ? "signed in" : "signed out"}`, async () => {
        vi.stubGlobal("scrollTo", vi.fn());
        vi.stubGlobal("localStorage", { getItem: vi.fn(() => null), setItem: vi.fn() });
        auth.user = signedIn ? { email: "owner@example.com" } : null;
        render(<MemoryRouter initialEntries={[path]}><SiteHeader /></MemoryRouter>);
        expect((await screen.findByRole("link", { name: "Brand Studio" })).getAttribute("href")).toBe("/create");
        expect(screen.getByRole("link", { name: "Saved Designs" }).getAttribute("href")).toBe("/saved");
        expect(screen.queryByText("Logos/Icons")).toBeNull();
      });
    }
  }
});
