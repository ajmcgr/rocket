import { describe, expect, it } from "vitest";
import { LAUNCH_CLIENT_ID, acceptancePlan, paidAcceptanceProof, pilotBuyer } from "../../supabase/functions/_shared/launchAcceptance";
const buyer = "11111111-1111-4111-8111-111111111111";
const owner = "22222222-2222-4222-8222-222222222222";
const id = "33333333-3333-4333-8333-333333333333";
const plan = { id, client_id: LAUNCH_CLIENT_ID, developer_account_id: "merchant-row", developer_user_id: owner, amount_cents: 100, currency: "usd", interval: "month", platform_fee_bps: 500 };
const transaction = { id: "transaction", user_id: buyer, client_id: LAUNCH_CLIENT_ID, product_id: id, developer_account_id: "merchant-row", stripe_account_id: "acct_merchant", status: "paid", amount_cents: 100, application_fee_cents: 5, currency: "usd", stripe_checkout_session_id: "cs_live_new", stripe_invoice_id: "in_new", stripe_subscription_id: "sub_new" };
const entitlement = { user_id: buyer, client_id: LAUNCH_CLIENT_ID, product_id: id, transaction_id: "transaction", status: "active", revoked_at: null, valid_until: "2026-11-01T00:00:00Z" };
describe("controlled Launch acceptance", () => {
  it("requires one independently configured buyer", () => {
    expect(pilotBuyer(buyer, owner, buyer)).toBe(true);
    for (const args of [[owner, owner, owner], [buyer, owner, undefined], [owner, buyer, buyer], [buyer, undefined, buyer], [buyer, owner, "invalid"]]) expect(pilotBuyer(...args as [string, string, string])).toBe(false);
  });
  it("binds the exact plan to Launch, its owner and current merchant", () => {
    expect(acceptancePlan(plan, id, "merchant-row", owner)).toBe(true);
    for (const change of [{ client_id: "other" }, { id: buyer }, { developer_account_id: "other" }, { developer_user_id: buyer }, { amount_cents: 99 }, { currency: "eur" }, { interval: "year" }, { platform_fee_bps: 0 }]) expect(acceptancePlan({ ...plan, ...change }, id, "merchant-row", owner)).toBe(false);
    expect(acceptancePlan(plan, undefined, "merchant-row", owner)).toBe(false);
  });
  it("requires a new live paid transaction with its exact unrevoked future entitlement", () => {
    const now = Date.parse("2026-10-06T00:00:00Z");
    expect(paidAcceptanceProof(transaction, entitlement, buyer, plan, "acct_merchant", now)).toBe(true);
    for (const change of [{ user_id: owner }, { client_id: "other" }, { product_id: buyer }, { stripe_account_id: "other" }, { developer_account_id: "other" }, { status: "pending" }, { amount_cents: 0 }, { application_fee_cents: 0 }, { currency: "eur" }, { stripe_checkout_session_id: "cs_test_new" }, { stripe_invoice_id: null }]) expect(paidAcceptanceProof({ ...transaction, ...change }, entitlement, buyer, plan, "acct_merchant", now)).toBe(false);
    for (const change of [{ user_id: owner }, { client_id: "other" }, { product_id: buyer }, { transaction_id: "imported" }, { status: "revoked" }, { revoked_at: "2026-10-01" }, { valid_until: null }, { valid_until: "bad" }, { valid_until: "2026-10-01" }]) expect(paidAcceptanceProof(transaction, { ...entitlement, ...change }, buyer, plan, "acct_merchant", now)).toBe(false);
  });
});
