import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "@/test/MemoryRouter";
import Library from "./Library";

const mocks = vi.hoisted(() => ({ user: { id: "buyer-1" } as { id: string } | null, invoke: vi.fn() }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: mocks.user, loading: false }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: mocks.invoke } } }));
beforeEach(() => {
  vi.stubGlobal("scrollTo", vi.fn());
  mocks.user = { id: "buyer-1" };
  mocks.invoke.mockReset();
  mocks.invoke.mockResolvedValue({ data: { purchases: [] }, error: null });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("My Purchases", () => {
  it("retains hidden-listing order history without an Open link or public-listing link",async()=>{
    mocks.invoke.mockResolvedValue({data:{purchases:[{purchase_id:'order',app_id:'hidden',app_name:'Unavailable listing',listing_available:false,website_url:null,plan:{name:'Bought product',amount_cents:3900,currency:'usd',billing_type:'one_time'},status:'refunded',active:false,order:{id:'order',date:'2026-10-01',status:'refunded'}}]},error:null});
    render(<MemoryRouter><Library/></MemoryRouter>);await screen.findByText('Unavailable listing');
    expect(screen.getByText(/Your purchase record is retained/)).toBeTruthy();
    expect(screen.getByText('order')).toBeTruthy();expect(screen.queryByRole('link',{name:'Open App'})).toBeNull();
    expect(screen.queryByRole('link',{name:'Unavailable listing'})).toBeNull();
    expect(screen.getByText(/Receipt access is not available/)).toBeTruthy();
  });
  it("shows separate one-time purchases without recurring or cancellation claims", async () => {
    const purchase = { app_id: "app-1", app_name: "Launch", website_url: "https://trylaunch.ai", plan: { name: "Launch Pro", amount_cents: 3900, currency: "usd", interval: null, billing_type: "one_time" }, status: "granted", active: true, valid_until: null };
    mocks.invoke.mockResolvedValue({ data: { purchases: [{ ...purchase, purchase_id: "purchase-1" }, { ...purchase, purchase_id: "purchase-2", status: "refunded", active: false }] }, error: null });
    render(<MemoryRouter><Library /></MemoryRouter>);
    expect(await screen.findByText("Purchased")).toBeTruthy();
    expect(screen.getAllByText(/Launch Pro · \$39.00 · One-time/)).toHaveLength(2);
    expect(screen.getAllByRole("link", { name: "Open App" })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Cancel at period end" })).toBeNull();
  });
  it("uses the existing buyer library endpoint and explains the empty state", async () => {
    render(<MemoryRouter><Library /></MemoryRouter>);
    expect(await screen.findByText("No purchases yet.")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "My Purchases" })).toBeTruthy();
    expect(mocks.invoke).toHaveBeenCalledWith("rocket-buy", { body: { action: "library", app_id: undefined } });
  });
  it("shows active app access and cancellation controls", async () => {
    mocks.invoke.mockResolvedValue({ data: { purchases: [{ app_id: "app-1", app_name: "Example", website_url: "https://example.com", plan: { name: "Pro", amount_cents: 1000, currency: "usd", interval: "month" }, status: "active", active: true, valid_until: null }] }, error: null });
    render(<MemoryRouter><Library /></MemoryRouter>);
    expect((await screen.findByRole("link", { name: "Open App" })).getAttribute("href")).toBe("https://example.com");
    expect(screen.getByRole("button", { name: "Cancel at period end" })).toBeTruthy();
  });
  it("does not request another buyer's records when signed out", async () => {
    mocks.user = null;
    render(<MemoryRouter><Library /></MemoryRouter>);
    expect(await screen.findByRole("link", { name: "Log in to see your library" })).toBeTruthy();
    expect(mocks.invoke).not.toHaveBeenCalled();
  });
  it("does not present a failed request as an empty subscription list", async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: { message: "Unavailable" } });
    render(<MemoryRouter><Library /></MemoryRouter>);
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.queryByText("No purchases yet.")).toBeNull();
  });
});
