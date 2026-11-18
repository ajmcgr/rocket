import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import DealFeeBreakdown from "./DealFeeBreakdown";
import type { DealFinancial } from "@/lib/rocketDeals";

const locked = {
  acquisition_price_minor: 1000000, currency: "USD", minor_digits: 2,
  buyer_fee_minor: 15000, seller_fee_minor: 15000, total_rocket_fee_minor: 30000,
  buyer_total_minor: 1015000, seller_net_minor: 985000, fee_version: 1,
  usd_minimum_applied: false, provider_fee_minor: null, processing_fee_minor: null,
} as DealFinancial;

describe("Deal Room closing fee disclosure", () => {
  it("shows the buyer's exact total before escrow fees", () => {
    render(<DealFeeBreakdown priceMinor={locked.acquisition_price_minor} currency="USD" role="buyer" locked={locked} />);
    expect(screen.getByText("$10,000.00")).toBeTruthy();
    expect(screen.getByText("$150.00")).toBeTruthy();
    expect(screen.getByText("$10,150.00")).toBeTruthy();
    expect(screen.getByText(/Third-party escrow and processing fees are separate/)).toBeTruthy();
  });
  it("shows the seller's exact net proceeds", () => {
    render(<DealFeeBreakdown priceMinor={locked.acquisition_price_minor} currency="USD" role="seller" locked={locked} />);
    expect(screen.getByText("$9,850.00")).toBeTruthy();
  });
});
