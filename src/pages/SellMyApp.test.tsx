import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SellMyApp from "./SellMyApp";

const mocks = vi.hoisted(() => ({ user: { id: "owner" } as { id: string } | null }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock("@/components/SiteHeader", () => ({ default: () => null }));
vi.mock("@/lib/myApps", () => ({ loadMyApps: async () => [{
  app_id: "owned-app", owned: true, owner_verification_level: "domain_verified",
  app: { name: "Launch", website_url: "https://trylaunch.ai" },
}, {
  app_id: "claimed-app", owned: true, owner_verification_level: "claimed",
  app: { name: "Claimed App", website_url: "https://example.com" },
}] }));
vi.mock("@/lib/analytics", () => ({ track: vi.fn() }));
vi.mock("@/lib/valuationShareIcon", () => ({ valuationShareIconUrl: () => null }));
vi.mock("@/lib/rocketAcquisition", () => ({
  acquisitionDb: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }) },
}));
vi.mock("@/components/AcquisitionSettings", () => ({
  default: ({ appId, suggestedPrice, startForSale, title }: {
    appId: string; suggestedPrice?: number | null; startForSale?: boolean; title?: string;
  }) => <div data-testid="sale-listing" data-app-id={appId} data-suggested-price={suggestedPrice ?? ""} data-start-for-sale={String(startForSale)}>{title}</div>,
}));
vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) => open ? <div>{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

beforeEach(() => { mocks.user = { id: "owner" }; });
afterEach(cleanup);

describe("Sell my app flow", () => {
  it("shows the app selector and listing form above the calculator without a valuation", async () => {
    render(<SellMyApp />);
    expect(screen.getByRole("heading", { name: "Sell my app", level: 1 })).not.toBeNull();
    await screen.findByRole("option", { name: /Launch.*verified/ });
    const selector = screen.getByRole("combobox", { name: "Choose your Rocket app" });
    const calculator = screen.getByRole("heading", { name: "Calculate your estimate" });
    expect(selector.compareDocumentPosition(calculator) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole("link", { name: "Submit a new app" }).getAttribute("href")).toBe("/submit");
    fireEvent.change(selector, { target: { value: "owned-app" } });
    const listing = await screen.findByTestId("sale-listing");
    expect(listing.getAttribute("data-app-id")).toBe("owned-app");
    expect(listing.getAttribute("data-start-for-sale")).toBe("true");
    expect(screen.queryByRole("heading", { name: "Share your valuation" })).toBeNull();
    fireEvent.change(screen.getByRole("spinbutton", { name: "Monthly recurring revenue" }), { target: { value: "1000" } });
    fireEvent.click(screen.getByRole("button", { name: "Calculate my valuation" }));
    expect(Number((await screen.findByTestId("sale-listing")).getAttribute("data-suggested-price"))).toBeGreaterThan(0);
  });

  it("prompts verification for a claimed app", async () => {
    render(<SellMyApp />);
    await screen.findByRole("option", { name: /Claimed App.*claimed/ });
    fireEvent.change(screen.getByRole("combobox", { name: "Choose your Rocket app" }), { target: { value: "claimed-app" } });
    expect(screen.getByRole("link", { name: "Verify this app" }).getAttribute("href")).toBe("/my-apps/claimed-app#verification");
    expect(screen.queryByTestId("sale-listing")).toBeNull();
  });

  it("offers sign-in and submission before calculating for a guest", async () => {
    mocks.user = null;
    render(<SellMyApp />);
    await waitFor(() => expect(screen.getByRole("link", { name: "Sign in to sell" }).getAttribute("href")).toBe("/login?next=%2Fsell"));
    expect(screen.getByRole("link", { name: "Submit a new app" }).getAttribute("href")).toBe("/submit");
    expect(screen.queryByTestId("sale-listing")).toBeNull();
  });
});
