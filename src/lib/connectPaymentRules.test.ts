import { describe, expect, it } from "vitest";
import { isCurrentInvoiceFullyRefunded, subscriptionAccessChange, verifiedPaidInvoicePeriodEnd } from "../../supabase/functions/_shared/connectPaymentRules";

describe("Connect payment access rules", () => {
  it("does not grant access from an unpaid or trialing subscription update", () => {
    expect(subscriptionAccessChange("active", false, "pending")).toBeNull();
    expect(subscriptionAccessChange("trialing", false, "pending")).toBeNull();
    expect(subscriptionAccessChange("active", false, "past_due")).toBeNull();
  });

  it("keeps paid access through a scheduled cancellation and revokes on failure", () => {
    expect(subscriptionAccessChange("active", true, "paid")).toBe("canceling");
    expect(subscriptionAccessChange("active", false, "canceling")).toBe("active");
    expect(subscriptionAccessChange("past_due", false, "paid")).toBe("past_due");
    expect(subscriptionAccessChange("canceled", false, "paid")).toBe("expired");
  });

  it("only revokes for a full refund of the current paid invoice", () => {
    expect(isCurrentInvoiceFullyRefunded(true, "in_old", "in_new")).toBe(false);
    expect(isCurrentInvoiceFullyRefunded(false, "in_new", "in_new")).toBe(false);
    expect(isCurrentInvoiceFullyRefunded(true, "in_new", "in_new")).toBe(true);
  });

  it("requires the exact paid price and period before granting access", () => {
    const expected = { currency: "usd", amount_cents: 1900, stripe_price_id: "price_right" };
    const invoice = { status: "paid", currency: "usd", amount_paid: 1900,
      lines: { data: [{ price: { id: "price_right" }, amount: 1900, period: { end: 1800000000 } }] } };
    expect(verifiedPaidInvoicePeriodEnd(invoice, expected)).toBe(1800000000);
    expect(verifiedPaidInvoicePeriodEnd({ ...invoice, amount_paid: 0 }, expected)).toBeNull();
    expect(verifiedPaidInvoicePeriodEnd({ ...invoice, lines: { data: [{ ...invoice.lines.data[0], price: { id: "price_wrong" } }] } }, expected)).toBeNull();
    expect(verifiedPaidInvoicePeriodEnd({ ...invoice, lines: { data: [{ pricing: { price_details: { price: "price_right" } }, amount: 1900, period: { end: 1800000000 } }] } }, expected)).toBe(1800000000);
  });
});
