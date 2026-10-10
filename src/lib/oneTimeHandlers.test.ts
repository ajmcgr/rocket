import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import * as payments from "../../supabase/functions/_shared/oneTimePayments";
import * as rules from "../../supabase/functions/_shared/connectPaymentRules";
import * as library from "../../supabase/functions/_shared/buyerLibrary";

function load(path: string, stripe: any, admin: any, gate = true, mode: "live" | "test" = "live") {
  let handler!: (req: Request) => Promise<Response>;
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status });
  runInNewContext(
    ts.transpileModule(readFileSync(path, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS },
    }).outputText,
    {
      exports: {},
      Request,
      Response,
      URL,
      Date,
      console,
      crypto,
      Deno: {
        env: {
          get: (key: string) =>
            key === "STRIPE_SECRET_KEY"
              ? "sk_live_mock_only"
              : key === "STRIPE_CONNECT_TEST_SECRET_KEY" && mode === "test"
                ? "sk_test_mock_only"
              : key === "STRIPE_CONNECT_LIVE_WEBHOOK_SECRET"
                ? "whsec_mock_only"
                : undefined,
        },
        serve: (fn: typeof handler) => (handler = fn),
      },
      require: (name: string) =>
        name.includes("buyerLibrary")
          ? library
          : name.startsWith("npm:stripe")
            ? {
                default: class {
                  constructor() {
                    return stripe;
                  }
                },
              }
            : name.includes("oneTimePayments")
              ? payments
              : name.includes("connectPaymentRules")
                ? rules
                : name.includes("connectLiveConfiguration")
                  ? {
                      isolatedLiveWebhookSecret: () => "whsec_mock_only",
                      liveWebhookConfigured: () => gate,
                    }
                  : name.includes("buyMerchant")
                    ? {
                        buyMerchantReadiness: async () => ({
                          ready: true,
                          chargesEnabled: true,
                          payoutsEnabled: true,
                          configuration: {},
                        }),
                      }
                    : name.includes("stripeConnectV2")
                      ? {
                          retrieveStripeConnectV2Merchant: async () => ({}),
                          stripeConnectV2Ready: () => true,
                          StripeConnectV2Error: class extends Error {},
                        }
                      : {
                          APP_URL: "https://tryrocket.ai",
                          getAdmin: () => admin,
                          getRocketUser: async () => ({ id: "buyer" }),
                          getConnectToken: async () => mode === "test" ? {
                            user_id: "buyer", client_id: "launch-test", scopes: ["entitlements:read"],
                          } : null,
                          base64url: (bytes: Uint8Array) =>
                            Buffer.from(bytes).toString("base64url"),
                          json,
                        },
    },
  );
  return handler;
}
const product = {
  id: "product",
  client_id: "launch",
  developer_account_id: "merchant",
  developer_user_id: "owner",
  product_key: "real-key",
  name: "Launch Pro",
  billing_type: "one_time",
  amount_cents: 3900,
  currency: "usd",
  platform_fee_bps: 500,
  stripe_price_id: "price_real",
  stripe_product_id: "prod_real",
  checkout_return_uris: ["https://trylaunch.ai/my-products?success=true"],
};
function query(data: any, extras: Record<string, any> = {}) {
  const result = { data, error: null };
  const q: any = {
    then: (resolve: any) => resolve(result),
    single: async () => result,
    maybeSingle: async () => result,
    ...extras,
  };
  for (const m of [
    "select",
    "eq",
    "not",
    "limit",
    "order",
    "in",
    "gt",
    "is",
    "update",
  ])
    q[m] ||= () => q;
  return q;
}
function checkoutHarness(
  kind = "one_time",
  gate = true,
  existingStatus?: string,
  products?: any[],
) {
  const create = vi
    .fn()
    .mockResolvedValue({
      id: "cs_real",
      url: "https://checkout.stripe.com/mock",
    });
  const p = {
    ...product,
    billing_type: kind,
    interval: kind === "subscription" ? "month" : null,
  };
  const admin = {
    rpc: async () => ({ data: true, error: null }),
    from: (table: string) =>
      query(
        table === "rocket_buy_configuration"
          ? { live_checkout_enabled: gate, platform_fee_bps: 500 }
          : table === "rocket_oauth_clients"
            ? {
                client_id: "launch",
                created_by: "owner",
                allowed_scopes: ["entitlements:read"],
              }
            : table === "connect_developer_accounts"
              ? {
                  id: "merchant",
                  stripe_account_id: "acct_launch",
                  stripe_api_version: "v2",
                  status: "active",
                  charges_enabled: true,
                  payouts_enabled: true,
                }
              : table === "connect_products"
                ? products || [p]
                : table === "connect_customers"
                  ? { stripe_customer_id: "cus_real" }
                  : table === "connect_checkout_attempts"
                    ? existingStatus
                      ? [{ stripe_checkout_session_id: "cs_real" }]
                      : []
                    : table === "connect_transactions"
                      ? []
                      : null,
        { upsert: () => query(null) },
      ),
  };
  const stripe = {
    prices: {
      retrieve: async (id: string) => {
        const selected = (products || [p]).find(
          (item) => item.stripe_price_id === id,
        );
        return {
          active: true,
          livemode: true,
          unit_amount: selected?.amount_cents || 3900,
          currency: "usd",
          product: selected?.stripe_product_id || "prod_real",
          type: selected?.billing_type || kind,
          recurring:
            (selected?.billing_type || kind) === "subscription"
              ? { interval: selected?.interval || "month" }
              : null,
        };
      },
    },
    checkout: {
      sessions: {
        create,
        retrieve: async () => ({
          status: existingStatus,
          url:
            existingStatus === "open"
              ? "https://checkout.stripe.com/mock"
              : null,
        }),
      },
    },
  };
  return {
    create,
    handler: load("supabase/functions/rocket-buy/index.ts", stripe, admin),
  };
}
const body = {
  action: "checkout",
  app_id: "b202d75a-02ae-46e6-8419-5b3410cbaac8",
  client_id: "launch",
  product_key: "real-key",
  purchase_request_id: "00000000-0000-4000-8000-000000000001",
  return_uri: "https://trylaunch.ai/my-products?success=true",
};
const request = (value: any) =>
  new Request("https://mock.invalid/", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(value),
  });
describe("actual production merchant registration (isolated)", () => {
  it("lets the owner's agent register a fixed inline offer without a duplicate Stripe Price", async () => {
    const insert = vi.fn((record: any) => query(record));
    const stripe = {
      prices: { retrieve: vi.fn() },
      products: { create: vi.fn() },
    };
    const admin = {
      rpc: async () => ({ data: true, error: null }),
      from: (table: string) =>
        query(
          table === "rocket_oauth_clients"
            ? {
                client_id: "launch",
                is_active: true,
                allowed_scopes: ["entitlements:read"],
                redirect_uris: ["https://trylaunch.ai/rocket/callback"],
              }
            : table === "connect_developer_accounts"
              ? {
                  id: "merchant",
                  client_id: "launch",
                  stripe_account_id: "acct_launch",
                  stripe_api_version: "v2",
                  status: "active",
                  charges_enabled: true,
                  payouts_enabled: true,
                }
              : table === "rocket_buy_configuration"
                ? { platform_fee_bps: 500 }
                : null,
          { insert },
        ),
    };
    const handler = load(
      "supabase/functions/rocket-buy-developer/index.ts",
      stripe,
      admin,
    );
    const registration = {
      ...body,
      action: "register_offer",
      price_source: "inline",
      name: "Launch Pro",
      amount_cents: 3900,
      currency: "usd",
      billing_type: "one_time",
      interval: null,
      payment_return_uri: body.return_uri,
    };
    expect((await handler(request(registration))).status).toBe(201);
    expect(insert.mock.calls[0][0]).toMatchObject({
      product_key: "real-key",
      price_source: "inline",
      stripe_price_id: null,
      stripe_product_id: null,
      amount_cents: 3900,
      is_active: false,
      platform_fee_bps: 500,
    });
    expect(stripe.prices.retrieve).not.toHaveBeenCalled();
    expect(
      (await handler(request({ ...registration, amount_cents: 1 }))).status,
    ).toBe(400);
    expect(
      (
        await handler(
          request({
            ...registration,
            payment_return_uri: "https://attacker.invalid",
          }),
        )
      ).status,
    ).toBe(400);
  });
  function registration() {
    const insert = vi.fn((record: any) => query(record));
    const stripe = {
      products: {
        create: vi.fn().mockResolvedValue({ id: "prod_real", livemode: true }),
      },
      prices: {
        create: vi
          .fn()
          .mockResolvedValue({
            id: "price_real",
            product: "prod_real",
            active: true,
            livemode: true,
            type: "one_time",
            unit_amount: 3900,
            currency: "usd",
          }),
      },
    };
    const admin = {
      rpc: async () => ({ data: true, error: null }),
      from: (table: string) =>
        query(
          table === "rocket_oauth_clients"
            ? {
                client_id: "launch",
                is_active: true,
                allowed_scopes: ["entitlements:read"],
                redirect_uris: ["https://trylaunch.ai/rocket/callback"],
              }
            : table === "connect_developer_accounts"
              ? {
                  id: "merchant",
                  client_id: "launch",
                  stripe_account_id: "acct_launch",
                  stripe_api_version: "v2",
                  status: "active",
                  charges_enabled: true,
                  payouts_enabled: true,
                }
              : table === "rocket_buy_configuration"
                ? { platform_fee_bps: 500 }
                : [],
          { insert },
        ),
    };
    return {
      insert,
      stripe,
      handler: load(
        "supabase/functions/rocket-buy-developer/index.ts",
        stripe,
        admin,
      ),
    };
  }
  const registrationBody = {
    ...body,
    action: "create_product",
    name: "Launch Pro",
    billing_type: "one_time",
    amount_cents: 3900,
    payment_return_uri: body.return_uri,
  };
  it("registers a new real-price-backed UUID/key, inactive, exclusively to merchant/client", async () => {
    const h = registration();
    expect((await h.handler(request(registrationBody))).status).toBe(201);
    const row = h.insert.mock.calls[0][0];
    expect(row.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(row.product_key).toMatch(/^launch-pro-/);
    expect(row.client_id).toBe("launch");
    expect(row.developer_account_id).toBe("merchant");
    expect(row.is_active).toBe(false);
    expect(row.interval).toBeNull();
    expect(row.amount_cents).toBe(3900);
    expect(row.checkout_return_uris).toEqual([body.return_uri]);
    expect(h.stripe.prices.create.mock.calls[0][0].recurring).toBeUndefined();
  });
  it.each([
    { client_id: "other" },
    { payment_return_uri: "https://other.invalid" },
  ])(
    "rejects cross-client registration and unapproved origins %j",
    async (patch) => {
      const h = registration();
      expect(
        (await h.handler(request({ ...registrationBody, ...patch }))).status,
      ).toBeGreaterThanOrEqual(400);
      expect(h.stripe.products.create).not.toHaveBeenCalled();
    },
  );

  const existingStripePrice = {
    id: "price_existing",
    active: true,
    livemode: true,
    billing_scheme: "per_unit",
    custom_unit_amount: null,
    type: "one_time",
    recurring: null,
    unit_amount: 19900,
    currency: "usd",
    product: {
      id: "prod_existing",
      name: "Grow",
      active: true,
      livemode: true,
    },
  };
  function importHarness(price: any = existingStripePrice, mapped: any[] = []) {
    const insert = vi.fn((record: any) => query(record));
    const list = vi.fn().mockResolvedValue({ data: [price], has_more: false });
    const retrieve = vi.fn().mockResolvedValue(price);
    const stripe = {
      prices: { list, retrieve },
      products: { create: vi.fn() },
    };
    const admin = {
      rpc: async () => ({ data: true, error: null }),
      from: (table: string) =>
        query(
          table === "rocket_oauth_clients"
            ? {
                client_id: "launch",
                is_active: true,
                allowed_scopes: ["entitlements:read"],
                redirect_uris: ["https://trylaunch.ai/rocket/callback"],
              }
            : table === "connect_developer_accounts"
              ? {
                  id: "merchant",
                  client_id: "launch",
                  stripe_account_id: "acct_launch",
                  stripe_api_version: "v2",
                  status: "active",
                  charges_enabled: true,
                  payouts_enabled: true,
                }
              : table === "rocket_buy_configuration"
                ? { platform_fee_bps: 500 }
                : table === "connect_products"
                  ? mapped
                  : [],
          { insert },
        ),
    };
    return {
      insert,
      list,
      retrieve,
      handler: load(
        "supabase/functions/rocket-buy-developer/index.ts",
        stripe,
        admin,
      ),
    };
  }
  it("lists only eligible prices on the verified connected account without creating Stripe objects", async () => {
    const h = importHarness();
    const response = await h.handler(
      request({ ...body, action: "stripe_catalog" }),
    );
    expect(response.status).toBe(200);
    expect((await response.json()).prices).toMatchObject([
      {
        name: "Grow",
        amount_cents: 19900,
        billing_type: "one_time",
        registered: false,
      },
    ]);
    expect(h.list.mock.calls[0][1]).toEqual({ stripeAccount: "acct_launch" });
  });
  it("imports an exact existing price as an inactive mapping without creating a Stripe product or price", async () => {
    const h = importHarness();
    const response = await h.handler(
      request({
        ...body,
        action: "import_price",
        stripe_price_id: "price_existing",
        product_key: "grow-access",
        payment_return_uri: body.return_uri,
      }),
    );
    expect(response.status).toBe(201);
    expect(h.retrieve.mock.calls[0][2]).toEqual({
      stripeAccount: "acct_launch",
    });
    expect(h.insert.mock.calls[0][0]).toMatchObject({
      stripe_price_id: "price_existing",
      stripe_product_id: "prod_existing",
      product_key: "grow-access",
      amount_cents: 19900,
      billing_type: "one_time",
      is_active: false,
      platform_fee_bps: 500,
    });
  });
  it("rejects an unsafe access key before importing the price", async () => {
    const h = importHarness();
    const response = await h.handler(
      request({
        ...body,
        action: "import_price",
        stripe_price_id: "price_existing",
        product_key: "Grow Access",
        payment_return_uri: body.return_uri,
      }),
    );
    expect(response.status).toBe(400);
    expect(h.retrieve).not.toHaveBeenCalled();
    expect(h.insert).not.toHaveBeenCalled();
  });
  it("maps a fixed annual subscription price without a payment-return URL", async () => {
    const annual = {
      ...existingStripePrice,
      type: "recurring",
      recurring: {
        interval: "year",
        interval_count: 1,
        usage_type: "licensed",
      },
      unit_amount: 9900,
    };
    const h = importHarness(annual);
    const response = await h.handler(
      request({
        ...body,
        action: "import_price",
        stripe_price_id: "price_existing",
        product_key: "pass-annual",
      }),
    );
    expect(response.status).toBe(201);
    expect(h.insert.mock.calls[0][0]).toMatchObject({
      billing_type: "subscription",
      interval: "year",
      amount_cents: 9900,
      product_key: "pass-annual",
      is_active: false,
    });
  });
  it("rejects usage-based subscription prices", async () => {
    const metered = {
      ...existingStripePrice,
      type: "recurring",
      recurring: {
        interval: "month",
        interval_count: 1,
        usage_type: "metered",
      },
    };
    const h = importHarness(metered);
    const response = await h.handler(
      request({
        ...body,
        action: "import_price",
        stripe_price_id: "price_existing",
      }),
    );
    expect(response.status).toBe(409);
    expect(h.insert).not.toHaveBeenCalled();
  });
  it.each([
    [{ ...existingStripePrice, livemode: false }, body.return_uri],
    [
      {
        ...existingStripePrice,
        product: { ...existingStripePrice.product, active: false },
      },
      body.return_uri,
    ],
    [existingStripePrice, "https://other.invalid/return"],
  ])(
    "rejects an unsafe price or unapproved return URL",
    async (price, returnUri) => {
      const h = importHarness(price);
      const response = await h.handler(
        request({
          ...body,
          action: "import_price",
          stripe_price_id: "price_existing",
          payment_return_uri: returnUri,
        }),
      );
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(h.insert).not.toHaveBeenCalled();
    },
  );
  it("does not remap a price that is already registered", async () => {
    const h = importHarness(existingStripePrice, [
      { id: "already", stripe_price_id: "price_existing" },
    ]);
    const response = await h.handler(
      request({
        ...body,
        action: "import_price",
        stripe_price_id: "price_existing",
        payment_return_uri: body.return_uri,
      }),
    );
    expect(response.status).toBe(409);
    expect(h.insert).not.toHaveBeenCalled();
  });
});
describe("actual production checkout handler (isolated)", () => {
  it("Library includes buyer-scoped one-time grants without exposing test clients", async () => {
    const filters: any[] = [];
    const admin = {
      from: (table: string) => {
        const q = query(
          table === "connect_entitlements"
            ? []
            : table === "connect_purchase_grants"
              ? [
                  {
                    purchase_id: "purchase",
                    client_id: "launch",
                    product_id: "product",
                    status: "granted",
                  },
                ]
              : table === "rocket_oauth_clients"
                ? [
                    {
                      client_id: "launch",
                      app_id: body.app_id,
                      environment: "production",
                    },
                  ]
                : table === "connect_products"
                  ? [product]
                  : table === "public_apps"
                    ? [
                        {
                          id: body.app_id,
                          name: "Launch",
                          website_url: "https://trylaunch.ai",
                        },
                      ]
                    : [],
        );
        q.eq = (...args: any[]) => {
          filters.push([table, ...args]);
          return q;
        };
        return q;
      },
    };
    const handler = load("supabase/functions/rocket-buy/index.ts", {}, admin);
    const response = await handler(request({ action: "library" }));
    expect(response.status).toBe(200);
    expect((await response.json()).purchases[0]).toMatchObject({
      purchase_id: "purchase",
      active: true,
      plan: { billing_type: "one_time" },
    });
    expect(filters).toContainEqual([
      "connect_purchase_grants",
      "user_id",
      "buyer",
    ]);
    expect(filters).toContainEqual([
      "rocket_oauth_clients",
      "environment",
      "production",
    ]);
  });
  it("creates payment mode, one unit, exact approved URI and $1.95 fee", async () => {
    const h = checkoutHarness();
    expect((await h.handler(request(body))).status).toBe(200);
    const [params, options] = h.create.mock.calls[0];
    expect(params.mode).toBe("payment");
    expect(params.payment_intent_data.application_fee_amount).toBe(195);
    expect(params.subscription_data).toBeUndefined();
    expect(params.line_items).toEqual([{ price: "price_real", quantity: 1 }]);
    expect(params.success_url).toBe(body.return_uri);
    expect(options.stripeAccount).toBe("acct_launch");
    expect(options.idempotencyKey).toContain(body.purchase_request_id);
  });
  it("preserves subscription checkout and percentage fee", async () => {
    const h = checkoutHarness("subscription");
    expect((await h.handler(request(body))).status).toBe(200);
    const [p] = h.create.mock.calls[0];
    expect(p.mode).toBe("subscription");
    expect(p.subscription_data.application_fee_percent).toBe(5);
    expect(p.payment_intent_data).toBeUndefined();
    expect(p.success_url).toBe(body.return_uri);
    expect(p.cancel_url).toBe(body.return_uri);
  });
  it("selects only the requested offer and keeps the fee and merchant authoritative", async () => {
    const second = {
      ...product,
      id: "pass",
      product_key: "pass-annual",
      name: "Launch Pass",
      amount_cents: 9900,
      billing_type: "subscription",
      interval: "year",
      stripe_price_id: "price_pass",
      stripe_product_id: "prod_pass",
    };
    const h = checkoutHarness("one_time", true, undefined, [product, second]);
    const catalog = await h.handler(request({ ...body, action: "catalog" }));
    expect((await catalog.json()).offers).toHaveLength(2);
    const checkout = await h.handler(
      request({ ...body, product_key: "pass-annual" }),
    );
    expect(checkout.status).toBe(200);
    const [params, options] = h.create.mock.calls[0];
    expect(params.mode).toBe("subscription");
    expect(params.line_items).toEqual([{ price: "price_pass", quantity: 1 }]);
    expect(params.subscription_data.application_fee_percent).toBe(5);
    expect(params.success_url).toBe(body.return_uri);
    expect(options.stripeAccount).toBe("acct_launch");
    const forged = await h.handler(
      request({
        ...body,
        product_key: "unknown",
        amount_cents: 1,
        platform_fee_bps: 0,
      }),
    );
    expect(forged.status).toBe(404);
  });
  it("creates a fixed inline one-time Checkout without a reusable Stripe Price", async () => {
    const inline = {
      ...product,
      price_source: "inline",
      stripe_price_id: null,
      stripe_product_id: null,
    };
    const h = checkoutHarness("one_time", true, undefined, [inline]);
    expect((await h.handler(request(body))).status).toBe(200);
    const [params] = h.create.mock.calls[0];
    expect(params.line_items).toEqual([
      {
        price_data: {
          currency: "usd",
          unit_amount: 3900,
          product_data: { name: "Launch Pro" },
        },
        quantity: 1,
      },
    ]);
    expect(params.payment_intent_data.application_fee_amount).toBe(195);
  });
  it("leaves the closed public gate effective", async () => {
    const h = checkoutHarness("one_time", false);
    expect((await h.handler(request(body))).status).toBe(409);
    expect(h.create).not.toHaveBeenCalled();
  });
  it.each([
    { client_id: "other" },
    { product_key: "other" },
    { return_uri: "https://attacker.invalid" },
    { purchase_request_id: null },
  ])("rejects mismatched checkout inputs %j", async (patch) => {
    const h = checkoutHarness();
    expect(
      (await h.handler(request({ ...body, ...patch }))).status,
    ).toBeGreaterThanOrEqual(400);
    expect(h.create).not.toHaveBeenCalled();
  });
  it("rejects an unapproved return URI for a subscription", async () => {
    const h = checkoutHarness("subscription");
    expect((await h.handler(request({ ...body, return_uri: "https://attacker.invalid" }))).status).toBe(400);
    expect(h.create).not.toHaveBeenCalled();
  });
  it("requires a stable request ID for subscriptions too", async () => {
    const h = checkoutHarness("subscription");
    expect((await h.handler(request({ ...body, purchase_request_id: null }))).status).toBe(400);
    expect(h.create).not.toHaveBeenCalled();
  });
  it("reuses open sessions and never reuses a completed request", async () => {
    for (const status of ["open", "complete"]) {
      const h = checkoutHarness("one_time", true, status);
      expect((await h.handler(request(body))).status).toBe(
        status === "open" ? 200 : 409,
      );
      expect(h.create).not.toHaveBeenCalled();
    }
  });
});

function webhookHarness(validSignature = true, mode = true, inline = false) {
  const metadata = {
    rocket_user_id: "buyer",
    rocket_client_id: "launch",
    rocket_product_id: "product",
  };
  const attempt = {
    user_id: "buyer",
    client_id: "launch",
    product_id: "product",
    stripe_checkout_session_id: "cs_real",
  };
  const transaction = {
    ...attempt,
    id: "purchase",
    stripe_payment_intent_id: "pi_real",
  };
  const grants = new Set<string>();
  const rpc = vi.fn(async (_name: string, args: any) => {
    grants.add(args.p_transaction_id);
    return { error: null };
  });
  const admin = {
    rpc,
    from: (table: string) =>
      query(
        table === "connect_developer_accounts"
          ? { id: "merchant", client_id: "launch" }
          : table === "connect_checkout_attempts"
            ? attempt
            : table === "connect_products"
            ? inline
              ? { ...product, price_source: "inline", stripe_price_id: null, stripe_product_id: null }
              : product
              : table === "connect_transactions"
                ? transaction
                : null,
        { insert: () => query(null), upsert: () => query(null) },
      ),
  };
  const checkout = {
    id: "cs_real",
    mode: "payment",
    status: "complete",
    payment_status: "paid",
    livemode: true,
    amount_total: 3900,
    currency: "usd",
    metadata,
    payment_intent: "pi_real",
  };
  const intent = {
    id: "pi_real",
    metadata,
    status: "succeeded",
    livemode: true,
    amount: 3900,
    amount_received: 3900,
    currency: "usd",
    application_fee_amount: 195,
    latest_charge: {
      id: "ch_real",
      payment_intent: "pi_real",
      paid: true,
      captured: true,
      livemode: true,
      refunded: false,
      disputed: false,
    },
  };
  const stripe = {
    webhooks: {
      constructEventAsync: async () => {
        if (!validSignature) throw Error("bad signature");
        return {
          id: "evt_mock",
          type: "checkout.session.completed",
          livemode: mode,
          account: "acct_launch",
          created: 1,
          data: { object: { id: "cs_real", mode: "payment" } },
        };
      },
    },
    checkout: {
      sessions: {
        retrieve: async () => checkout,
        listLineItems: async () => ({
          has_more: false,
          data: [
            {
              quantity: 1,
              price: inline
                ? { id: "price_inline", livemode: true, type: "one_time", currency: "usd", unit_amount: 3900 }
                : { id: "price_real", product: "prod_real" },
              amount_total: 3900,
              currency: "usd",
            },
          ],
        }),
      },
    },
    paymentIntents: { retrieve: async () => intent },
  };
  return {
    grants,
    rpc,
    checkout,
    intent,
    handler: load(
      "supabase/functions/connect-payment-webhook/index.ts",
      stripe,
      admin,
    ),
  };
}
const webhookRequest = () =>
  new Request("https://mock.invalid/", {
    method: "POST",
    headers: { "stripe-signature": "mock" },
    body: "mock",
  });
describe("actual one-time webhook handler (isolated)", () => {
  it("settles an agent-registered inline offer from Stripe's signed event", async () => {
    const h = webhookHarness(true, true, true);
    expect((await h.handler(webhookRequest())).status).toBe(200);
    expect(h.grants.size).toBe(1);
    expect(h.rpc.mock.calls[0][1].p_status).toBe("granted");
  });
  it("settles duplicate deliveries against the same canonical purchase", async () => {
    const h = webhookHarness();
    for (let i = 0; i < 3; i++)
      expect((await h.handler(webhookRequest())).status).toBe(200);
    expect(h.grants.size).toBe(1);
    expect(h.rpc.mock.calls[0][1].p_status).toBe("granted");
  });
  it.each([
    [false, true],
    [true, false],
  ])("rejects signature or environment mismatch", async (sig, mode) => {
    const h = webhookHarness(sig, mode);
    expect((await h.handler(webhookRequest())).status).toBe(400);
    expect(h.rpc).not.toHaveBeenCalled();
  });
  it("never fulfils unpaid or amount-mismatched checkouts", async () => {
    const h = webhookHarness();
    h.checkout.payment_status = "unpaid";
    expect((await h.handler(webhookRequest())).status).toBe(200);
    expect(h.rpc).not.toHaveBeenCalled();
    const g = webhookHarness();
    g.intent.amount_received = 1;
    expect((await g.handler(webhookRequest())).status).toBe(500);
    expect(g.rpc).not.toHaveBeenCalled();
  });
  it("keeps a canonically refunded charge revoked despite checkout delivery", async () => {
    const h = webhookHarness();
    h.intent.latest_charge.refunded = true;
    expect((await h.handler(webhookRequest())).status).toBe(200);
    expect(h.rpc.mock.calls[0][1].p_status).toBe("refunded");
  });
});

describe("test one-time checkout", () => {
  function harness(priceOverride: Record<string, unknown> = {}) {
    const create = vi.fn().mockResolvedValue({ id: "cs_test", url: "https://checkout.stripe.com/test" });
    const testProduct = {
      ...product,
      client_id: "launch-test",
      interval: null,
      is_active: true,
      connect_developer_accounts: {
        id: "merchant", client_id: "launch-test", stripe_account_id: "acct_test",
        status: "active", charges_enabled: true, payouts_enabled: true,
        is_current: true, stripe_api_version: "v2",
      },
    };
    const records: Record<string, unknown> = {
      connect_products: testProduct,
      rocket_oauth_clients: { environment: "test" },
      connect_checkout_attempts: null,
      connect_customers: { stripe_customer_id: "cus_test" },
    };
    const admin = { from: (table: string) => {
      const q = query(records[table]);
      q.upsert = async () => ({ error: null });
      return q;
    } };
    const stripe = {
      prices: { retrieve: vi.fn().mockResolvedValue({
        id: "price_real", livemode: false, active: true, type: "one_time",
        recurring: null, unit_amount: 3900, currency: "usd", product: "prod_real",
        ...priceOverride,
      }) },
      checkout: { sessions: { create } },
    };
    return { create, handler: load("supabase/functions/connect-payment-checkout/index.ts", stripe, admin, true, "test") };
  }

  it("creates an isolated $39 one-time TEST Checkout with the exact $1.95 Rocket fee", async () => {
    const h = harness();
    const response = await h.handler(new Request("https://mock.invalid/", {
      method: "POST", body: JSON.stringify({ product_key: "real-key", return_uri: product.checkout_return_uris[0], purchase_request_id: "6187613f-ae3e-44b2-a2ba-2c5ac7d32ebd" }),
    }));
    expect(response.status).toBe(200);
    const [params, options] = h.create.mock.calls[0];
    expect(params.mode).toBe("payment");
    expect(params.line_items).toEqual([{ price: "price_real", quantity: 1 }]);
    expect(params.payment_intent_data.application_fee_amount).toBe(195);
    expect(params.payment_intent_data.metadata).toEqual(params.metadata);
    expect(options.stripeAccount).toBe("acct_test");
  });

  it("fails closed when the registered TEST price differs from the immutable offer", async () => {
    const h = harness({ unit_amount: 1 });
    const response = await h.handler(new Request("https://mock.invalid/", {
      method: "POST", body: JSON.stringify({ product_key: "real-key", return_uri: product.checkout_return_uris[0], purchase_request_id: "6187613f-ae3e-44b2-a2ba-2c5ac7d32ebd" }),
    }));
    expect(response.status).toBe(503);
    expect(h.create).not.toHaveBeenCalled();
  });
});
