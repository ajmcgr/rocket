import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

const id = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function harness({ amount = 4900, refunded = false, disputed = false, signature = true,
  applied = true, test = false, account = "acct_1TfvwfL9pkHWyRRu" } = {}) {
  let handler!: (request: Request) => Promise<Response>;
  const event = { id: "evt_advertising", type: "checkout.session.completed",
    created: 1791662400, livemode: !test, account: null,
    data: { object: {
      id: test ? "cs_test_canonical" : "cs_live_canonical", mode: "payment", status: "complete",
      payment_status: "paid", livemode: !test, client_reference_id: id,
      metadata: { rocket_sponsorship_id: id, rocket_sponsorship_type: "featured_app" },
      amount_total: amount, amount_subtotal: amount, currency: "usd",
      payment_intent: "pi_canonical",
    } },
  };
  const rpc = vi.fn(async () => ({ data: applied, error: null }));
  const from = vi.fn((table: string) => {
    const query: Record<string, unknown> = {};
    for (const method of ["select", "eq"] ) query[method] = () => query;
    query.single = async () => ({ data: table === "rocket_sponsorships" ? {
      id, sponsorship_type: "featured_app", purchaser_user_id: "owner",
      purchaser_email: "owner@example.com", target_app_id: "app",
      target_category: null, stripe_checkout_session_id: event.data.object.id,
      stripe_livemode: !test, amount_cents: 4900, status: "pending",
    } : {
      live_product_id: "prod_canonical", test_product_id: "prod_canonical",
      live_price_id: "price_canonical", test_price_id: "price_canonical",
    }, error: null });
    return query;
  });
  class StripeMock {
    webhooks = { constructEventAsync: async (_body: string, _sig: string, secret: string) => {
      if (!signature || (test && secret === "whsec_live_mock")) throw new Error("Invalid signature");
      return event;
    } };
    accounts = { retrieve: async () => ({ id: account }) };
    products = { retrieve: async () => ({ active: true, livemode: !test,
      name: "Rocket Featured App", metadata: { rocket_product_type: "featured_app" } }) };
    prices = { retrieve: async () => ({ active: true, livemode: !test,
      product: "prod_canonical", type: "one_time", unit_amount: 4900, currency: "usd" }) };
    checkout = { sessions: { listLineItems: async () => ({ data: [{ quantity: 1,
      price: { id: "price_canonical" }, amount_total: 4900 }] }) } };
    paymentIntents = { retrieve: async () => ({ id: "pi_canonical", status: "succeeded",
      livemode: !test, amount: 4900, amount_received: 4900, currency: "usd",
      latest_charge: "ch_canonical", metadata: { rocket_sponsorship_id: id } }) };
    charges = { retrieve: async () => ({ payment_intent: "pi_canonical", livemode: !test,
      amount: 4900, amount_refunded: refunded ? 4900 : 0, refunded, disputed, currency: "usd" }) };
  }
  runInNewContext(ts.transpileModule(
    readFileSync("supabase/functions/stripe-webhook/index.ts", "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } },
  ).outputText, {
    exports: {}, Request, Response, console,
    require: (name: string) => name.startsWith("npm:stripe")
      ? { default: StripeMock } : { createClient: () => ({ from, rpc }) },
    Deno: { env: { get: (name: string) => ({
      STRIPE_SECRET_KEY: "sk_live_mock", STRIPE_WEBHOOK_SECRET: "whsec_live_mock",
      STRIPE_ADVERTISING_TEST_SECRET_KEY: "sk_test_mock",
      STRIPE_ADVERTISING_TEST_WEBHOOK_SECRET: "whsec_test_mock",
      SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "service_mock",
      RESEND_API_KEY: null,
    })[name as "STRIPE_SECRET_KEY"] }, serve: (fn: typeof handler) => { handler = fn; } },
  });
  const request = () => handler(new Request("https://example.com/stripe-webhook", {
    method: "POST", headers: { "stripe-signature": "t=1,v1=mock" }, body: "{}",
  }));
  return { request, rpc, from };
}

describe("Rocket advertising verified webhook isolation", () => {
  it("books exactly the canonical Rocket-owned paid placement", async () => {
    const { request, rpc, from } = harness();
    expect((await request()).status).toBe(200);
    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith("apply_rocket_sponsorship_payment", expect.objectContaining({
      p_sponsorship_id: id, p_price_id: "price_canonical", p_amount_cents: 4900,
      p_livemode: true, p_fully_refunded: false,
    }));
    expect(from).not.toHaveBeenCalledWith("subscriptions");
    expect(from).not.toHaveBeenCalledWith("purchases");
  });

  it("rejects a wrong amount before any fulfilment", async () => {
    const { request, rpc } = harness({ amount: 29900 });
    expect((await request()).status).toBe(500);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects a different Stripe platform account", async () => {
    const { request, rpc } = harness({ account: "acct_wrong" });
    expect((await request()).status).toBe(500);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("denies display for a charge refunded before Checkout delivery", async () => {
    const { request, rpc } = harness({ refunded: true });
    expect((await request()).status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("apply_rocket_sponsorship_payment", expect.objectContaining({
      p_fully_refunded: true,
    }));
  });

  it("denies display and records a dispute that predates Checkout delivery", async () => {
    const { request, rpc } = harness({ disputed: true });
    expect((await request()).status).toBe(200);
    expect(rpc).toHaveBeenNthCalledWith(1, "apply_rocket_sponsorship_payment", expect.objectContaining({
      p_fully_refunded: true,
    }));
    expect(rpc).toHaveBeenNthCalledWith(2, "apply_rocket_sponsorship_dispute", expect.objectContaining({
      p_payment_intent_id: "pi_canonical",
    }));
  });

  it("accepts duplicate delivery without calling unrelated commerce RPCs", async () => {
    const { request, rpc } = harness({ applied: false });
    expect((await request()).status).toBe(200);
    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc.mock.calls[0][0]).toBe("apply_rocket_sponsorship_payment");
  });

  it("rejects an invalid signature before database writes", async () => {
    const { request, rpc } = harness({ signature: false });
    expect((await request()).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("uses the isolated TEST signature and TEST catalog without touching live fulfilment", async () => {
    const { request, rpc } = harness({ test: true });
    expect((await request()).status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("apply_rocket_sponsorship_payment", expect.objectContaining({
      p_livemode: false,
    }));
  });
});
