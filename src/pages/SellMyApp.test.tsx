import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SellMyApp from "./SellMyApp";

const mocks = vi.hoisted(() => ({ user: { id: "owner", email: "owner@example.com" } as { id: string; email: string } | null, saveError: false }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }), upsert: async () => ({ error: mocks.saveError ? new Error("offline") : null }) }) } }));
vi.mock("@/components/SiteHeader", () => ({ default: () => null }));
vi.mock("@/lib/myApps", () => ({ loadMyApps: async () => [{
  app_id: "owned-app", owned: true, owner_verification_level: "domain_verified",
  app: { name: "Launch", website_url: "https://trylaunch.ai" },
}, {
  app_id: "claimed-app", owned: true, owner_verification_level: "claimed",
  app: { name: "Claimed App", website_url: "https://example.com" },
}] }));
vi.mock("@/lib/analytics", () => ({ track: vi.fn(), trackValuationOnce: vi.fn() }));
vi.mock("@/lib/valuationShareIcon", () => ({ valuationShareIconUrl: () => null }));
vi.mock("@/lib/rocketAcquisition", () => ({
  acquisitionDb: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }) },
}));
vi.mock("@/components/AcquisitionSettings", () => ({
  default: ({ appId, suggestedPrice, startForSale, title, initialDraft }: {
    appId: string; suggestedPrice?: number | null; startForSale?: boolean; title?: string;
    initialDraft?: { description: string };
  }) => <div data-testid="sale-listing" data-app-id={appId} data-suggested-price={suggestedPrice ?? ""} data-start-for-sale={String(startForSale)} data-draft-description={initialDraft?.description ?? ""}>{title}</div>,
}));
vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) => open ? <div>{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const persistent = new Map<string, string>();
beforeEach(() => {
  mocks.user = { id: "owner", email: "owner@example.com" }; mocks.saveError = false; sessionStorage.clear(); persistent.clear();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => persistent.get(key) ?? null,
    setItem: (key: string, value: string) => persistent.set(key, value),
    removeItem: (key: string) => persistent.delete(key),
    clear: () => persistent.clear(),
  });
});
afterEach(cleanup);

describe("Sell my app flow", () => {
  it("shows the app selector and listing form above the calculator without a valuation", async () => {
    render(<SellMyApp />);
    expect(await screen.findByRole("heading", { name: "Sell my app", level: 1 })).not.toBeNull();
    await screen.findByRole("option", { name: /Launch.*verified/ });
    const selector = screen.getByRole("combobox", { name: "Choose your Rocket app" });
    const calculator = screen.getByRole("heading", { name: "Calculate your valuation" });
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

  it("shows sale fields before sign-up and keeps the guest draft across authentication", async () => {
    mocks.user = null;
    const { unmount } = render(<SellMyApp />);
    expect(screen.getByRole("textbox", { name: "App name" })).not.toBeNull();
    expect(screen.getByRole("textbox", { name: "App website" })).not.toBeNull();
    expect(screen.getByRole("textbox", { name: "Short description" })).not.toBeNull();
    expect(screen.getByRole("link", { name: "Continue to sign up" }).getAttribute("href")).toBe("/signup?next=%2Fsell");
    fireEvent.click(screen.getByRole("link", { name: "Continue to sign up" }));
    expect(screen.getByRole("alert").textContent).toContain("app name");
    fireEvent.change(screen.getByRole("textbox", { name: "App name" }), { target: { value: "Launch" } });
    fireEvent.change(screen.getByRole("textbox", { name: "App website" }), { target: { value: "https://trylaunch.ai" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Your email" }), { target: { value: "owner@example.com" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Short description" }), { target: { value: "Available for buyers" } });
    const continueButton = screen.getByRole("link", { name: "Continue to sign up" });
    continueButton.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(continueButton);
    await waitFor(() => expect(sessionStorage.getItem("rocket:sell-listing-draft-v1")).toContain("Available for buyers"));
    unmount();
    mocks.user = { id: "owner", email: "owner@example.com" };
    render(<SellMyApp />);
    await waitFor(() => expect(screen.getByTestId("sale-listing").getAttribute("data-app-id")).toBe("owned-app"));
    expect(screen.getByTestId("sale-listing").getAttribute("data-draft-description")).toBe("Available for buyers");
  });

  it("carries a new app's name and URL into Rocket's submission flow", async () => {
    render(<SellMyApp />);
    await screen.findByRole("option", { name: /Launch.*verified/ });
    fireEvent.change(screen.getByRole("textbox", { name: "App name" }), { target: { value: "New Startup" } });
    fireEvent.change(screen.getByRole("textbox", { name: "App website" }), { target: { value: "https://new-startup.example" } });
    const submit = screen.getByRole("link", { name: "Submit this app to Rocket" });
    submit.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(submit);
    const submission = JSON.parse(sessionStorage.getItem("rocket:app-submission-v2") || "null");
    expect(submission.url).toBe("https://new-startup.example");
    expect(submission.details.name).toBe("New Startup");
  });

  it("keeps the signup handoff draft when the account save fails", async () => {
    mocks.user = null;
    const guest = render(<SellMyApp />);
    fireEvent.change(screen.getByRole("textbox", { name: "App name" }), { target: { value: "Launch" } });
    fireEvent.change(screen.getByRole("textbox", { name: "App website" }), { target: { value: "https://trylaunch.ai" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Your email" }), { target: { value: "owner@example.com" } });
    const continueButton = screen.getByRole("link", { name: "Continue to sign up" });
    continueButton.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(continueButton);
    guest.unmount();
    mocks.user = { id: "owner", email: "owner@example.com" }; mocks.saveError = true;
    render(<SellMyApp />);
    await screen.findByTestId("sale-listing");
    expect(sessionStorage.getItem("rocket:sell-listing-draft-v1")).toContain("Launch");
    expect(localStorage.getItem("rocket:sell-pending-signup-draft-v1")).toContain("Launch");
    expect(screen.getByRole("alert").textContent).toContain("could not be saved");
  });

  it("does not render one account's sale draft after switching accounts", async () => {
    sessionStorage.setItem("rocket:sell-account-draft-v1:owner", JSON.stringify({ savedAt: Date.now(),
      draft: { appName: "Private Startup", appUrl: "https://private.example", contactEmail: "owner@example.com",
        status: "for_sale", price: "80000", description: "Private sale details", reason: "", buyer: "", valuationInputs: null } }));
    const view = render(<SellMyApp />);
    expect((await screen.findByRole("textbox", { name: "App name" }) as HTMLInputElement).value).toBe("Private Startup");
    mocks.user = { id: "other", email: "other@example.com" };
    view.rerender(<SellMyApp />);
    expect(screen.queryByDisplayValue("Private Startup")).toBeNull();
    expect((await screen.findByRole("textbox", { name: "App name" }) as HTMLInputElement).value).toBe("");
  });
});
