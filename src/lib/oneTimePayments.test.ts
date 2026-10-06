import { describe, expect, it } from "vitest";
import { approvedPaymentReturn, billingType, priceMatches, verifiedOneTimePayment } from "../../supabase/functions/_shared/oneTimePayments";

const fixture = () => {
  const product = { id: "canonical", client_id: "launch", billing_type: "one_time", amount_cents: 3900, currency: "usd", platform_fee_bps: 500, stripe_price_id: "price_real", stripe_product_id: "prod_real" };
  const attempt = { user_id: "buyer", client_id: "launch", stripe_checkout_session_id: "cs_real" };
  const metadata = { rocket_user_id: "buyer", rocket_client_id: "launch", rocket_product_id: "canonical" };
  const session = { id: "cs_real", mode: "payment", status: "complete", payment_status: "paid", livemode: true, amount_total: 3900, currency: "usd", metadata, payment_intent: "pi_real" };
  const intent = { id: "pi_real", metadata, status: "succeeded", livemode: true, amount: 3900, amount_received: 3900, currency: "usd", application_fee_amount: 195, latest_charge: { id: "ch_real", payment_intent: "pi_real", paid: true, captured: true, livemode: true } };
  const lines = { has_more: false, data: [{ quantity: 1, price: { id: "price_real", product: "prod_real" }, amount_total: 3900, currency: "usd" }] };
  return { product, attempt, session, intent, lines };
};
const valid = (f: ReturnType<typeof fixture>) => verifiedOneTimePayment(f.session, f.intent, f.lines, f.product, f.attempt, true);

describe("canonical one-time settlement", () => {
  it("verifies one $39 unit and the existing 5% fee", () => expect(valid(fixture())).toBe(true));
  it.each(["amount_total", "currency", "payment_status", "livemode", "mode", "payment_intent"]) ("rejects mismatched session %s", field => {
    const f = fixture(); (f.session as any)[field] = "wrong"; expect(valid(f)).toBe(false);
  });
  it.each(["amount", "amount_received", "currency", "application_fee_amount", "status", "livemode", "latest_charge"])("rejects mismatched intent %s", field => {
    const f = fixture(); (f.intent as any)[field] = null; expect(Boolean(valid(f))).toBe(false);
  });
  it("rejects another merchant/client and forged metadata", () => {
    const f = fixture(); f.product.client_id = "other"; expect(valid(f)).toBe(false);
    const g = fixture(); g.intent.metadata.rocket_user_id = "other"; expect(valid(g)).toBe(false);
  });
  it("rejects quantity, price substitution and additional lines", () => {
    const f = fixture(); f.lines.data[0].quantity = 2; expect(valid(f)).toBe(false);
    const g = fixture(); g.lines.data[0].price.id = "other"; expect(valid(g)).toBe(false);
    const h = fixture(); h.lines.has_more = true; expect(valid(h)).toBe(false);
  });
  it("preserves legacy recurring pricing and rejects test prices in production", () => {
    const product = { amount_cents: 3900, currency: "usd", stripe_product_id: "p", interval: "month" };
    const price = { active: true, livemode: true, product: "p", unit_amount: 3900, currency: "usd", recurring: { interval: "month" } };
    expect(billingType(product)).toBe("subscription"); expect(priceMatches(product, price, true)).toBe(true);
    expect(priceMatches(product, { ...price, livemode: false }, true)).toBe(false);
    expect(priceMatches({ ...product, billing_type: "one_time" }, price, true)).toBe(false);
  });
  it("allows only HTTPS registered client origins, without credentials or fragments", () => {
    const redirects = ["https://trylaunch.ai/rocket/callback"];
    expect(approvedPaymentReturn("https://trylaunch.ai/my-products?success=true", redirects)).toBe(true);
    for (const uri of ["http://trylaunch.ai/my-products", "https://other.ai/", "https://trylaunch.ai/#fake", "https://user@trylaunch.ai/"]) expect(approvedPaymentReturn(uri, redirects)).toBe(false);
  });
});
