// @vitest-environment node
import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import * as rules from "../../supabase/functions/_shared/launchAcceptance";
const buyer = "11111111-1111-4111-8111-111111111111", owner = "22222222-2222-4222-8222-222222222222", planId = "33333333-3333-4333-8333-333333333333";
const source = readFileSync("supabase/functions/launch-rocket-acceptance/index.ts", "utf8").replace(/^import .*;\n/gm, "");
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
function harness(options: { enabled?: boolean; user?: string; prior?: boolean; paid?: boolean; external?: boolean; token?: boolean; total?: number } = {}) {
  const writes: string[] = [], calls: string[] = [];
  const plan = { id: planId, client_id: rules.LAUNCH_CLIENT_ID, developer_user_id: owner, developer_account_id: "account", amount_cents: 100, currency: "usd", interval: "month", platform_fee_bps: 500, name: "Acceptance", stripe_product_id: "prod_new", stripe_price_id: "price_new", is_active: false, integration_confirmed_at: null };
  const data: Record<string, unknown> = {
    rocket_oauth_clients: { client_id: rules.LAUNCH_CLIENT_ID, app_id: rules.LAUNCH_APP_ID, created_by: owner, environment: "production", is_active: true, allowed_scopes: ["entitlements:read"], redirect_uris: ["https://trylaunch.ai/rocket/callback"] },
    rocket_buy_configuration: { platform_fee_bps: 500, live_checkout_enabled: false },
    connect_developer_accounts: { id: "account", stripe_account_id: "acct_new", stripe_api_version: "v2", status: "active", charges_enabled: true, payouts_enabled: true },
    connect_products: plan,
    connect_transactions: { id: "txn", user_id: buyer, client_id: rules.LAUNCH_CLIENT_ID, product_id: planId, developer_account_id: "account", stripe_account_id: "acct_new", status: "paid", amount_cents: 100, application_fee_cents: 5, currency: "usd", stripe_checkout_session_id: "cs_live_new", stripe_invoice_id: "in_new", stripe_subscription_id: "sub_new", stripe_customer_id: "cus_new" },
    connect_entitlements: { id: "grant", user_id: buyer, client_id: rules.LAUNCH_CLIENT_ID, product_id: planId, transaction_id: "txn", status: "active", revoked_at: null, valid_until: new Date(Date.now() + 86400000).toISOString() },
  };
  const admin = { rpc: async () => ({ data: true }), from: (table: string) => {
    let head = false;
    const query: any = { select: (_: unknown, options?: any) => { head = options?.head; return query; }, eq: () => query, is: () => query, single: async () => ({ data: data[table], error: null }), insert: () => { writes.push(table); return query; }, update: () => { writes.push(table); return query; }, upsert: () => { writes.push(table); return query; }, then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: head ? null : data[table], count: options.prior ? 1 : 0, error: null }).then(resolve) };
    return query;
  } };
  class Stripe {
    prices = { retrieve: async () => ({ livemode: true, active: true, unit_amount: 100, currency: "usd", recurring: { interval: "month" }, product: "prod_new" }) };
    invoices = { retrieve: async () => ({ id: "in_new", livemode: true, status: options.paid === false ? "open" : "paid", amount_paid: 100, currency: "usd", subscription: "sub_new", customer: "cus_new" }) };
    customers = { create: async () => { calls.push("customer"); return { id: "cus_new" }; } };
    checkout = { sessions: { create: async () => { calls.push("checkout"); return { id: "cs_live_new", url: "https://checkout.stripe.com/example", livemode: true, status: "open", amount_total: options.total ?? 100, currency: "usd", expires_at: Math.floor(Date.now() / 1000) + 1800 }; }, expire: async () => { calls.push("expire"); } } };
  }
  const env: Record<string, string> = { STRIPE_SECRET_KEY: "sk_live_mock", STRIPE_CONNECT_LIVE_WEBHOOK_SECRET: "whsec_mock", LAUNCH_ACCEPTANCE_ENABLED: options.enabled ? "true" : "false", LAUNCH_ACCEPTANCE_BUYER_USER_ID: buyer, LAUNCH_ACCEPTANCE_PLAN_ID: planId };
  let serve: (req: Request) => Promise<Response>;
  new Function("Stripe", "getAdmin", "getConnectToken", "getRocketUser", "retrieveStripeConnectV2Merchant", "stripeConnectV2Ready", "liveWebhookConfigured", ...Object.keys(rules), "Deno", "fetch", compiled)(Stripe, () => admin, async () => options.token === false ? null : { client_id: rules.LAUNCH_CLIENT_ID, user_id: buyer, scopes: ["entitlements:read"] }, async () => ({ id: options.user || buyer }), async () => ({}), () => true, () => true, ...Object.values(rules), { env: { get: (key: string) => env[key] }, serve: (fn: typeof serve) => { serve = fn; } }, async () => new Response(JSON.stringify({ message: options.external === false ? "denied" : "Your new Buy with Rocket purchase unlocks this Launch acceptance area." }), { status: 200, headers: { "Content-Type": "application/json" } }));
  return { writes, calls, request: (action: string, terms = true) => serve(new Request("https://rocket.test", { method: "POST", headers: { Authorization: "Bearer mock", "X-Rocket-ID-Token": "mock", "Content-Type": "application/json" }, body: JSON.stringify({ action, ...(terms ? { confirm_purchase_terms: "1 USD per month until canceled", amount_limit_cents: 100 } : {}) }) })) };
}
describe("Launch pilot endpoint", () => {
  it("disabled pilot cannot create a customer, checkout or write records", async () => {
    const h = harness();
    expect((await h.request("status")).status).toBe(200);
    expect((await h.request("checkout")).status).toBe(409);
    expect(h.calls).toEqual([]); expect(h.writes).toEqual([]);
  });
  it("owner, other buyer, prior purchase and absent terms cannot initiate checkout", async () => {
    for (const options of [{ user: owner }, { user: "other" }, { prior: true }]) {
      const h = harness({ enabled: true, ...options }); expect((await h.request("checkout")).status).toBeGreaterThanOrEqual(400); expect(h.calls).toEqual([]);
    }
    const h = harness({ enabled: true }); expect((await h.request("checkout", false)).status).toBe(400); expect(h.calls).toEqual([]);
  });
  it("only the selected new buyer can receive the exact-total checkout", async () => {
    const h = harness({ enabled: true }); expect((await h.request("checkout")).status).toBe(200); expect(h.calls).toEqual(["customer", "checkout"]); expect(h.writes).toEqual(["connect_customers", "connect_checkout_attempts"]);
    const mismatch = harness({ enabled: true, total: 101 }); expect((await mismatch.request("checkout")).status).toBe(409); expect(mismatch.calls).toContain("expire"); expect(mismatch.writes).toEqual([]);
  });
  it("requires current authorization, canonical paid invoice and real external access before recording proof", async () => {
    for (const options of [{ token: false }, { paid: false }, { external: false }]) { const h = harness(options); expect((await h.request("proof")).status).toBeGreaterThanOrEqual(400); expect(h.writes).toEqual([]); expect(h.calls).toEqual([]); }
    const h = harness(); expect((await h.request("proof")).status).toBe(200); expect(h.writes).toEqual(["connect_entitlement_events", "connect_products"]); expect(h.calls).toEqual([]);
  });
});
