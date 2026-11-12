import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { MemoryRouter } from "@/test/MemoryRouter";
import AppsForSale, { type SaleItem } from "./AppsForSale";

vi.mock("@/components/SiteHeader", () => ({ default: () => null }));
vi.mock("@/components/AppLogo", () => ({ default: () => <span aria-hidden="true">Logo</span> }));
vi.mock("@/components/AppTrustBadges", () => ({ default: () => null }));
vi.mock("@/lib/analytics", () => ({ track: vi.fn() }));

const make = (name: string, status: SaleItem["listing"]["status"], price: number | null, category: string): SaleItem => ({
  app: { id: name, slug: name.toLowerCase(), name, tagline: `${name} tagline`, description: null, categories: [category], logo_url: null },
  listing: { app_id: name, status, review_status: "approved", asking_price_cents: price, description: "", updated_at: "2026-11-12T00:00:00Z" },
});
const initial = [make("Alpha", "for_sale", 10000, "Productivity"), make("Beta", "open_to_offers", null, "AI"), make("Gamma", "for_sale", 50000, "AI")];

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

it("shows only real listings and filters by status, category and known asking price", async () => {
  vi.stubGlobal("scrollTo", vi.fn());
  render(<MemoryRouter><AppsForSale initial={initial} /></MemoryRouter>);
  expect(await screen.findByText("Alpha")).toBeTruthy();
  expect(screen.getByText("Beta")).toBeTruthy();
  expect(screen.getByText("Gamma")).toBeTruthy();
  const filters = screen.getByLabelText("Filter apps for sale");
  fireEvent.change(within(filters).getByLabelText("Availability"), { target: { value: "for_sale" } });
  expect(screen.queryByText("Beta")).toBeNull();
  fireEvent.change(within(filters).getByLabelText("Category"), { target: { value: "AI" } });
  expect(screen.queryByText("Alpha")).toBeNull();
  expect(screen.getByText("Gamma")).toBeTruthy();
  fireEvent.change(within(filters).getByLabelText("Max price (USD)"), { target: { value: "200" } });
  expect(screen.queryByText("Gamma")).toBeNull();
  expect(screen.getByText("No matching apps yet")).toBeTruthy();
});

it("does not invent listings when no app is approved", async () => {
  vi.stubGlobal("scrollTo", vi.fn());
  render(<MemoryRouter><AppsForSale initial={[]} /></MemoryRouter>);
  expect(await screen.findByText("No matching apps yet")).toBeTruthy();
  expect(screen.queryByText("Alpha")).toBeNull();
});
