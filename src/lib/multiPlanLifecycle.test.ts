// @vitest-environment node
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, it, expect } from "vitest";
import * as paymentRules from "../../supabase/functions/_shared/connectPaymentRules";
import * as oneTime from "../../supabase/functions/_shared/oneTimePayments";
const compiled = ts.transpileModule(
  readFileSync("supabase/functions/connect-payment-webhook/index.ts", "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS } },
).outputText;
function fixture() {
  const metadata = {
    rocket_user_id: "buyer",
    rocket_client_id: "client",
    rocket_product_id: "annual",
  };
  const tables: Record<string, any[]> = {
    connect_developer_accounts: [
      {
        id: "merchant",
        client_id: "client",
        stripe_account_id: "acct_merchant",
        rocket_oauth_clients: { environment: "production" },
      },
    ],
    connect_products: [
      {
        id: "annual",
        client_id: "client",
        developer_account_id: "merchant",
        stripe_price_id: "price_annual",
        billing_type: "subscription",
        platform_fee_bps: 500,
        is_active: false,
      },
    ],
    connect_checkout_attempts: [
      {
        stripe_checkout_session_id: "cs",
        client_id: "client",
        user_id: "buyer",
        origin: "EXTERNAL_BUTTON",
      },
    ],
    connect_transactions: [
      {
        id: "tx",
        user_id: "buyer",
        client_id: "client",
        product_id: "annual",
        developer_account_id: "merchant",
        stripe_account_id: "acct_merchant",
        stripe_subscription_id: "sub",
        stripe_checkout_session_id: "cs",
        status: "pending",
        currency: "usd",
        amount_cents: 21000,
        stripe_invoice_id: null,
      },
    ],
    connect_entitlements: [],
    connect_entitlement_events: [],
    connect_webhook_events: [],
  };
  const admin = {
    rpc: async () => ({ error: null }),
    from: (table: string) => {
      let kind = "select",
        value: any,
        conflict = "",
        one = false;
      const filters: ((r: any) => boolean)[] = [];
      const get = (r: any, k: string) =>
        k.split(".").reduce((r, k) => r?.[k], r);
      const run = () => {
        let data = tables[table].filter((r) => filters.every((f) => f(r)));
        let error: any = null;
        if (kind === "insert" || kind === "upsert") {
          const found = tables[table].find((r) =>
            (conflict ? conflict.split(",") : ["event_id"]).every(
              (k) => r[k] === value[k],
            ),
          );
          if (found && kind === "insert" && table === "connect_webhook_events")
            error = { code: "23505" };
          else if (found && kind === "upsert") {
            Object.assign(found, value);
            data = [found];
          } else {
            const row = { id: `${table}-${tables[table].length}`, ...value };
            tables[table].push(row);
            data = [row];
          }
        }
        if (kind === "update") data.forEach((r) => Object.assign(r, value));
        return { data: one ? data[0] || null : data, error };
      };
      const q: any = {
        select: () => q,
        eq: (k: string, v: any) => {
          filters.push((r) => get(r, k) === v);
          return q;
        },
        contains: (k: string, v: any) => {
          filters.push((r) =>
            Object.entries(v).every(([key, value]) => r[k]?.[key] === value),
          );
          return q;
        },
        maybeSingle: () => {
          one = true;
          return Promise.resolve(run());
        },
        single: () => {
          one = true;
          return Promise.resolve(run());
        },
        update: (v: any) => {
          kind = "update";
          value = v;
          return q;
        },
        insert: (v: any) => {
          kind = "insert";
          value = v;
          return q;
        },
        upsert: (v: any, o: any) => {
          kind = "upsert";
          value = v;
          conflict = o.onConflict;
          return q;
        },
        then: (resolve: any) => Promise.resolve(run()).then(resolve),
      };
      return q;
    },
  };
  let event: any, handler: (r: Request) => Promise<Response>;
  const invoice: any = {
    id: "invoice_1",
    object: "invoice",
    subscription: "sub",
    status: "paid",
    currency: "usd",
    amount_paid: 21000,
    billing_reason: "subscription_create",
    subscription_details: { metadata },
    lines: {
      data: [
        {
          price: { id: "price_annual" },
          amount: 21000,
          period: { end: 1900000000 },
        },
      ],
    },
  };
  const subscription: any = {
    id: "sub",
    object: "subscription",
    metadata,
    status: "active",
    cancel_at_period_end: false,
    items: {
      data: [{ price: { id: "price_annual" }, current_period_end: 1900000000 }],
    },
  };
  const stripe = {
    webhooks: { constructEventAsync: async () => event },
    subscriptions: { retrieve: async () => subscription },
    invoices: { retrieve: async (id: string) => ({ ...invoice, id }) },
    refunds: { list: async function* () {} },
    charges: {
      retrieve: async () => ({
        invoice: invoice.id,
        payment_intent: "pi",
        amount: 21000,
        currency: "usd",
      }),
    },
  };
  runInNewContext(compiled, {
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
            ? "sk_live_fixture"
            : key === "STRIPE_CONNECT_LIVE_WEBHOOK_SECRET"
              ? "whsec_fixture"
              : undefined,
      },
      serve: (fn: typeof handler) => (handler = fn),
    },
    require: (name: string) =>
      name.startsWith("npm:stripe")
        ? {
            default: class {
              constructor() {
                return stripe;
              }
            },
          }
        : name.includes("oneTimePayments")
          ? oneTime
          : name.includes("connectPaymentRules")
            ? paymentRules
            : name.includes("connectLiveConfiguration")
              ? { isolatedLiveWebhookSecret: () => "whsec_fixture" }
              : { getAdmin: () => admin },
  });
  let sequence = 0;
  const send = async (type: string, object: any, id?: string) => {
    event = {
      id: id || `evt_${++sequence}`,
      type,
      livemode: true,
      account: "acct_merchant",
      created: 1000 + sequence,
      data: { object },
    };
    return handler!(
      new Request("https://fixture/webhook", {
        method: "POST",
        headers: { "stripe-signature": "fixture" },
        body: "fixture",
      }),
    );
  };
  return { tables, invoice, subscription, metadata, send };
}
describe("actual signed-event subscription lifecycle with unpublished annual offer", () => {
  it("settles initial annual purchase, renews once, and records source without requiring publication", async () => {
    const h = fixture();
    expect((await h.send("invoice.paid", h.invoice, "first")).status).toBe(200);
    expect(h.tables.connect_entitlements[0]).toMatchObject({
      user_id: "buyer",
      client_id: "client",
      product_id: "annual",
      status: "active",
      valid_until: new Date(1900000000 * 1000).toISOString(),
    });
    h.invoice.id = "invoice_2";
    h.invoice.billing_reason = "subscription_cycle";
    h.invoice.lines.data[0].period.end = 1930000000;
    expect((await h.send("invoice.paid", h.invoice, "renewal")).status).toBe(
      200,
    );
    expect((await h.send("invoice.paid", h.invoice, "renewal")).status).toBe(
      200,
    );
    expect(h.tables.connect_entitlement_events).toHaveLength(2);
    expect(
      h.tables.connect_webhook_events.find((r) => r.event_id === "renewal")
        .detail,
    ).toMatchObject({
      commerce_event: "subscription_renewed",
      origin: "EXTERNAL_BUTTON",
      environment: "production",
      offer_id: "annual",
    });
  });
  it("revokes access on failed renewal", async () => {
    const h = fixture();
    await h.send("invoice.paid", h.invoice);
    await h.send("invoice.payment_failed", { ...h.invoice, status: "open" });
    expect(h.tables.connect_entitlements[0].status).toBe("past_due");
  });
  it("keeps the paid period on scheduled cancellation, then expires", async () => {
    const h = fixture();
    await h.send("invoice.paid", h.invoice);
    h.subscription.cancel_at_period_end = true;
    await h.send("customer.subscription.updated", h.subscription);
    expect(h.tables.connect_entitlements[0]).toMatchObject({
      status: "canceling",
      valid_until: new Date(1900000000 * 1000).toISOString(),
    });
    await h.send("customer.subscription.deleted", h.subscription);
    expect(h.tables.connect_entitlements[0].status).toBe("expired");
    expect(h.tables.connect_entitlements[0].revoked_at).toBeTruthy();
  });
  it("revokes a full current refund and preserves a refund of an older invoice", async () => {
    const h = fixture();
    await h.send("invoice.paid", h.invoice);
    await h.send("charge.refunded", {
      id: "charge",
      invoice: "old_invoice",
      refunded: true,
    });
    expect(h.tables.connect_entitlements[0].status).toBe("active");
    await h.send("charge.refunded", {
      id: "charge",
      invoice: h.invoice.id,
      refunded: true,
    });
    expect(h.tables.connect_entitlements[0].status).toBe("refunded");
  });
  it("revokes disputed payments", async () => {
    const h = fixture();
    await h.send("invoice.paid", h.invoice);
    await h.send("charge.dispute.created", {
      id: "dispute",
      charge: "charge",
      amount: 21000,
      currency: "usd",
    });
    expect(h.tables.connect_entitlements[0].status).toBe("disputed");
  });
  it.each(["rocket_user_id", "rocket_client_id", "rocket_product_id"])(
    "rejects another entitlement's %s",
    async (field) => {
      const h = fixture();
      (h.metadata as any)[field] = "other";
      expect((await h.send("invoice.paid", h.invoice)).status).toBe(500);
      expect(h.tables.connect_entitlements).toHaveLength(0);
    },
  );
  it("does not grant annual access for a monthly price or an unpaid update", async () => {
    const h = fixture();
    h.invoice.lines.data[0].price.id = "price_month";
    expect((await h.send("invoice.paid", h.invoice)).status).toBe(500);
    await h.send("customer.subscription.updated", h.subscription);
    expect(h.tables.connect_entitlements).toHaveLength(0);
  });
});
