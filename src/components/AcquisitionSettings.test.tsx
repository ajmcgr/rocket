import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AcquisitionSettings from "./AcquisitionSettings";

const mocks = vi.hoisted(() => ({
  listing: null as null | Record<string, unknown>,
  rpc: vi.fn(),
  track: vi.fn(),
}));

vi.mock("@/lib/router-compat", () => ({ Link: ({ to, children, ...props }: any) => <a href={to} {...props}>{children}</a> }));
vi.mock("@/lib/analytics", () => ({ track: mocks.track }));
vi.mock("@/lib/rocketAcquisition", () => ({
  askingPrice: (cents: number | null) => cents === null ? "Price on request" : `$${cents / 100}`,
  acquisitionDb: {
    from: (table: string) => ({
      select: () => ({
        eq: () => table === "rocket_conversations"
          ? Promise.resolve({ count: 0, error: null })
          : { maybeSingle: async () => ({ data: mocks.listing, error: null }) },
      }),
    }),
    rpc: mocks.rpc,
  },
}));

beforeEach(() => {
  mocks.listing = null;
  mocks.rpc.mockReset().mockResolvedValue({ data: "approved", error: null });
  mocks.track.mockReset();
});
afterEach(cleanup);

describe("selling after a valuation", () => {
  it("prefills a new USD listing and publishes it for a verified owner", async () => {
    render(<AcquisitionSettings appId="owned-app" suggestedPrice={16200} startForSale title="Sell my app" />);
    expect(await screen.findByRole("heading", { name: "Sell my app" })).not.toBeNull();
    const status = screen.getByRole("combobox", { name: "Acquisition status" }) as HTMLSelectElement;
    await waitFor(() => expect(status.value).toBe("for_sale"));
    expect((screen.getByRole("spinbutton", { name: "Asking price (USD, optional)" }) as HTMLInputElement).value).toBe("16200");
    expect(mocks.rpc).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Publish listing" }));
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith("set_rocket_acquisition_listing", {
      p_app_id: "owned-app", p_status: "for_sale", p_asking_price_cents: 1_620_000,
      p_description: "", p_reason: "", p_preferred_buyer: "",
    }));
    expect((await screen.findByRole("status")).textContent).toContain("Listing is live");
    expect(screen.queryByText(/review is required/i)).toBeNull();
    expect(mocks.track).toHaveBeenCalledWith("acquisition_listing_created", { app_id: "owned-app" });
  });

  it("preserves an existing listing price instead of replacing it with the estimate", async () => {
    mocks.listing = {
      app_id: "owned-app", seller_user_id: "owner", status: "for_sale", review_status: "approved",
      asking_price_cents: 7_900_000, description: "Existing listing", reason_for_selling: "", preferred_buyer: "",
    };
    render(<AcquisitionSettings appId="owned-app" suggestedPrice={16200} startForSale title="Sell my app" />);
    await waitFor(() => expect((screen.getByRole("spinbutton", { name: "Asking price (USD, optional)" }) as HTMLInputElement).value).toBe("79000"));
    expect((screen.getByRole("textbox", { name: "Short description" }) as HTMLTextAreaElement).value).toBe("Existing listing");
  });

  it("prefills sale details entered before sign-up for a new listing", async () => {
    render(<AcquisitionSettings appId="owned-app" startForSale initialDraft={{
      appName: "Launch", appUrl: "https://trylaunch.ai", status: "for_sale", price: "79000",
      description: "Available for buyers", reason: "New focus", buyer: "Operator",
    }} />);
    await waitFor(() => expect((screen.getByRole("spinbutton", { name: "Asking price (USD, optional)" }) as HTMLInputElement).value).toBe("79000"));
    expect((screen.getByRole("textbox", { name: "Short description" }) as HTMLTextAreaElement).value).toBe("Available for buyers");
    expect((screen.getByRole("textbox", { name: "Reason for selling (optional)" }) as HTMLInputElement).value).toBe("New focus");
  });

  it("uses the new draft when an older listing was disabled", async () => {
    mocks.listing = {
      app_id: "owned-app", seller_user_id: "owner", status: "not_for_sale", review_status: "pending",
      asking_price_cents: null, description: "Old description", reason_for_selling: "", preferred_buyer: "",
    };
    render(<AcquisitionSettings appId="owned-app" initialDraft={{
      appName: "Launch", appUrl: "https://trylaunch.ai", status: "open_to_offers", price: "",
      description: "Fresh details", reason: "", buyer: "",
    }} />);
    await waitFor(() => expect((screen.getByRole("combobox", { name: "Acquisition status" }) as HTMLSelectElement).value).toBe("open_to_offers"));
    expect((screen.getByRole("textbox", { name: "Short description" }) as HTMLTextAreaElement).value).toBe("Fresh details");
  });

  it("allows a sale listing without an asking price", async () => {
    render(<AcquisitionSettings appId="owned-app" suggestedPrice={null} startForSale />);
    await waitFor(() => expect((screen.getByRole("combobox", { name: "Acquisition status" }) as HTMLSelectElement).value).toBe("for_sale"));
    fireEvent.click(screen.getByRole("button", { name: "Publish listing" }));
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith("set_rocket_acquisition_listing", expect.objectContaining({
      p_asking_price_cents: null, p_status: "for_sale",
    })));
  });

  it("offers a later valuation without discarding unsaved listing details", async () => {
    const { rerender } = render(<AcquisitionSettings appId="owned-app" suggestedPrice={null} startForSale />);
    const description = await screen.findByRole("textbox", { name: "Short description" }) as HTMLTextAreaElement;
    fireEvent.change(description, { target: { value: "A buyer-ready listing" } });
    rerender(<AcquisitionSettings appId="owned-app" suggestedPrice={16200} startForSale />);
    expect(description.value).toBe("A buyer-ready listing");
    expect((screen.getByRole("spinbutton", { name: "Asking price (USD, optional)" }) as HTMLInputElement).value).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Use $16,200 valuation as asking price" }));
    expect((screen.getByRole("spinbutton", { name: "Asking price (USD, optional)" }) as HTMLInputElement).value).toBe("16200");
    expect(description.value).toBe("A buyer-ready listing");
  });
});
