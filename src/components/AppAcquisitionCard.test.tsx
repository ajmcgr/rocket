import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { MemoryRouter } from "@/test/MemoryRouter";
import AppAcquisitionCard from "./AppAcquisitionCard";

const mocks = vi.hoisted(() => ({ row: null as null | Record<string, unknown> }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: mocks.row, error: null }) }) }) }) },
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("@/lib/analytics", () => ({ track: vi.fn() }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("keeps unapproved acquisition status off the public profile", async () => {
  vi.stubGlobal("scrollTo", vi.fn());
  mocks.row = { app_id: "app-1", status: "for_sale", review_status: "pending", asking_price_cents: 50000 };
  render(<MemoryRouter><AppAcquisitionCard appId="app-1" /></MemoryRouter>);
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(screen.queryByText("This app is for sale")).toBeNull();
});

it("shows approved asking price and preserves Contact Founder destination", async () => {
  vi.stubGlobal("scrollTo", vi.fn());
  mocks.row = { app_id: "app-1", status: "for_sale", review_status: "approved", asking_price_cents: 50000, description: "A useful product" };
  render(<MemoryRouter><AppAcquisitionCard appId="app-1" /></MemoryRouter>);
  expect(await screen.findByText("This app is for sale")).toBeTruthy();
  expect(screen.getByText("Asking price: $500")).toBeTruthy();
  expect(screen.getByRole("link", { name: /Contact Founder/ }).getAttribute("href")).toBe("/inbox?start=app-1");
});
