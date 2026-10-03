// Execute the actual Edge Function with isolated Stripe/Supabase mocks.
// These are regression tests, not proof of a real Stripe payment/webhook.
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

function checkoutHarness(existing = false, authenticated = true) {
  let handler!: (request: Request) => Promise<Response>;
  const create = vi
    .fn()
    .mockResolvedValue({
      id: "cs_new",
      url: "https://checkout.stripe.com/test",
    });
  const retrieve = vi
    .fn()
    .mockResolvedValue({
      status: "open",
      url: "https://checkout.stripe.com/existing",
    });
  const update = vi.fn();
  const chain = (data: unknown) => {
    const result = { data, error: null };
    const query: Record<string, unknown> = {
      then: (resolve: (value: unknown) => void) => resolve(result),
    };
    for (const method of ["select", "eq", "is"]) query[method] = () => query;
    query.maybeSingle = async () => result;
    query.update = (value: unknown) => {
      update(value);
      return query;
    };
    return query;
  };
  const client = {
    auth: {
      getUser: async () => ({
        data: {
          user: authenticated
            ? { id: "owner", email: "test@example.com" }
            : null,
        },
      }),
    },
    from: (table: string) =>
      chain(
        table === "rocket_billing_prices"
          ? {
              stripe_price_id: "price_canonical",
              stripe_product_id: "prod_canonical",
            }
          : table === "rocket_developer_memberships" ||
              table === "subscriptions"
            ? { stripe_customer_id: "cus_existing", status: "canceled" }
            : null,
      ),
    rpc: async () => ({
      data: {
        id: "attempt",
        idempotency_key: "checkout-attempt",
        stripe_session_id: existing ? "cs_existing" : null,
      },
      error: null,
    }),
  };
  class StripeMock {
    prices = {
      retrieve: async () => ({
        active: true,
        livemode: true,
        product: "prod_canonical",
        unit_amount: 9900,
        currency: "usd",
        type: "recurring",
        recurring: { interval: "year", interval_count: 1 },
      }),
    };
    checkout = { sessions: { create, retrieve } };
  }
  const source = readFileSync(
    "supabase/functions/stripe-checkout/index.ts",
    "utf8",
  );
  runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS },
    }).outputText,
    {
      exports: {},
      Request,
      Response,
      console,
      require: (name: string) =>
        name.startsWith("npm:stripe")
          ? { default: StripeMock }
          : { createClient: () => client },
      Deno: {
        env: {
          get: (key: string) =>
            key === "STRIPE_SECRET_KEY" ? "sk_live_mock" : "mock",
        },
        serve: (fn: typeof handler) => {
          handler = fn;
        },
      },
    },
  );
  const request = (body: object) =>
    handler(
      new Request("https://example.com/checkout", {
        method: "POST",
        headers: { Authorization: "Bearer mock" },
        body: JSON.stringify(body),
      }),
    );
  return { request, create, retrieve, update };
}

describe("Rocket Developer promotion-code Checkout", () => {
  it("uses native promotion codes and the canonical server price; ignores client discount/price overrides", async () => {
    const { request, create } = checkoutHarness();
    const response = await request({
      product: "rocket_developer",
      price: "price_attacker",
      discount_amount: 9900,
      coupon: "private_id",
      interval: "month",
    });
    expect(response.status).toBe(200);
    const params = create.mock.calls[0][0];
    expect(params.allow_promotion_codes).toBe(true);
    expect(params.mode).toBe("subscription");
    expect(params.line_items).toEqual([
      { price: "price_canonical", quantity: 1 },
    ]);
    expect(params).not.toHaveProperty("discounts");
    expect(params.subscription_data.metadata).toEqual({
      rocket_developer_user_id: "owner",
      product: "rocket_developer",
    });
  });
  it("reuses pre-existing open sessions without modifying subscriptions", async () => {
    const { request, create, update } = checkoutHarness(true);
    const response = await request({ product: "rocket_developer" });
    expect(await response.json()).toEqual({
      url: "https://checkout.stripe.com/existing",
    });
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
  it("keeps the existing Create price, trial, metadata and promotion-code behavior", async () => {
    const { request, create } = checkoutHarness();
    await request({ product: "pro" });
    const params = create.mock.calls[0][0];
    expect(params.line_items).toEqual([
      { price: "price_1TgpCLL9pkHWyRRuJGdfC77g", quantity: 1 },
    ]);
    expect(params.subscription_data).toEqual({
      trial_period_days: 7,
      metadata: { user_id: "owner", product: "pro" },
    });
    expect(params.allow_promotion_codes).toBe(true);
  });
  it("rejects unauthenticated checkout without creating a Stripe session", async () => {
    const { request, create } = checkoutHarness(false, false);
    expect((await request({ product: "rocket_developer" })).status).toBe(401);
    expect(create).not.toHaveBeenCalled();
  });
});

describe("Discounted Developer webhook regression (mocked Stripe)", () => {
  it.each([0, 4950, 9900])(
    "fulfills by canonical subscription state, even when checkout total is %i cents",
    async (amount) => {
      let handler!: (request: Request) => Promise<Response>;
      const rpc = vi.fn().mockResolvedValue({ error: null });
      const sub = {
        id: "sub_developer",
        status: "active",
        customer: "cus_developer",
        metadata: { rocket_developer_user_id: "owner" },
        items: { data: [{ price: { id: "price_canonical" }, quantity: 1 }] },
        current_period_start: 1791000000,
        current_period_end: 1822536000,
        cancel_at_period_end: false,
      };
      const event = {
        id: `evt_${amount}`,
        type: "checkout.session.completed",
        created: 1791000000,
        data: {
          object: {
            mode: "subscription",
            subscription: sub.id,
            amount_total: amount,
          },
        },
      };
      const from = vi.fn(() => {
        const query: Record<string, unknown> = {};
        for (const method of ["select", "eq"]) query[method] = () => query;
        query.maybeSingle = async () => ({
          data: { stripe_price_id: "price_canonical" },
          error: null,
        });
        return query;
      });
      class StripeMock {
        webhooks = { constructEventAsync: async () => event };
        subscriptions = { retrieve: async () => sub };
        customers = {
          retrieve: async () => ({
            metadata: { rocket_developer_user_id: "owner" },
          }),
        };
      }
      runInNewContext(
        ts.transpileModule(
          readFileSync("supabase/functions/stripe-webhook/index.ts", "utf8"),
          { compilerOptions: { module: ts.ModuleKind.CommonJS } },
        ).outputText,
        {
          exports: {},
          Request,
          Response,
          console,
          require: (name: string) =>
            name.startsWith("npm:stripe")
              ? { default: StripeMock }
              : { createClient: () => ({ from, rpc }) },
          Deno: {
            env: { get: () => "mock" },
            serve: (fn: typeof handler) => {
              handler = fn;
            },
          },
        },
      );
      const response = await handler(
        new Request("https://example.com/webhook", {
          method: "POST",
          headers: { "stripe-signature": "mock-verified-by-StripeMock" },
          body: "{}",
        }),
      );
      expect(response.status).toBe(200);
      expect(rpc).toHaveBeenCalledOnce();
      expect(rpc).toHaveBeenCalledWith(
        "apply_rocket_developer_subscription_event",
        expect.objectContaining({
          p_user_id: "owner",
          p_price_id: "price_canonical",
          p_status: "active",
        }),
      );
      expect(from).toHaveBeenCalledOnce();
      expect(from).toHaveBeenCalledWith("rocket_billing_prices");
    },
  );
});
