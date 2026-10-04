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

describe("Your Subscriptions", () => {
  it("uses the existing buyer library endpoint and explains the empty state", async () => {
    render(<MemoryRouter><Library /></MemoryRouter>);
    expect(await screen.findByText("No subscriptions yet.")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Your Subscriptions" })).toBeTruthy();
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
    expect(await screen.findByRole("link", { name: "Log in to see your subscriptions" })).toBeTruthy();
    expect(mocks.invoke).not.toHaveBeenCalled();
  });
  it("does not present a failed request as an empty subscription list", async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: { message: "Unavailable" } });
    render(<MemoryRouter><Library /></MemoryRouter>);
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.queryByText("No subscriptions yet.")).toBeNull();
  });
});
