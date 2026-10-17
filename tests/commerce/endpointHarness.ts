import { readFileSync } from "node:fs";
import ts from "typescript";
import {
  billingType,
  priceMatches,
  approvedPaymentReturn,
  importableStripePrice,
} from "../../supabase/functions/_shared/oneTimePayments";
import {
  libraryPurchases,
  sandboxLibraryPurchases,
} from "../../supabase/functions/_shared/buyerLibrary";
export const ids = {
  app: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  buyer: "11111111-1111-4111-8111-111111111111",
  owner: "22222222-2222-4222-8222-222222222222",
  month: "33333333-3333-4333-8333-333333333333",
  year: "44444444-4444-4444-8444-444444444444",
  once: "55555555-5555-4555-8555-555555555555",
};
export function harness(
  options: {
    user?: string | null;
    endpoint?: "rocket-buy" | "rocket-buy-developer";
    token?: { user_id: string; client_id: string; scopes: string[] };
    owner?: boolean;
    ready?: boolean;
    enabled?: boolean;
    multi?: boolean;
  } = {},
) {
  const products = [
    {
      id: ids.month,
      product_key: "pro-month",
      entitlement_key: "pro",
      name: "Pro",
      interval: "month",
      amount_cents: 1900,
      billing_type: "subscription",
    },
    {
      id: ids.year,
      product_key: "pro-year",
      entitlement_key: "pro",
      name: "Pro",
      interval: "year",
      amount_cents: 21000,
      billing_type: "subscription",
    },
    {
      id: ids.once,
      product_key: "once",
      entitlement_key: "once",
      name: "Lifetime",
      interval: null,
      amount_cents: 3900,
      billing_type: "one_time",
    },
  ].map((p) => ({
    ...p,
    client_id: "client",
    developer_account_id: "merchant",
    developer_user_id: ids.owner,
    currency: "usd",
    platform_fee_bps: 500,
    stripe_price_id: `price_${p.id}`,
    stripe_product_id: "prod",
    is_active: true,
    activated_at: "2026-01-01",
    checkout_return_uris: ["https://merchant.example/paid"],
    description: "Verified tier",
  }));
  const tables: Record<string, any[]> = {
    rocket_buy_configuration: [
      {
        singleton: true,
        platform_fee_bps: 500,
        live_checkout_enabled: options.enabled !== false,
        multi_plan_enabled: options.multi !== false,
      },
    ],
    rocket_oauth_clients: [
      {
        client_id: "client",
        app_id: ids.app,
        created_by: ids.owner,
        is_active: true,
        environment: "production",
        allowed_scopes: ["entitlements:read"],
      },
    ],
    connect_developer_accounts: [
      {
        id: "merchant",
        client_id: "client",
        developer_user_id: ids.owner,
        is_current: true,
        stripe_account_id: "acct_merchant",
        status: "active",
        charges_enabled: true,
        payouts_enabled: true,
      },
    ],
    connect_products: products,
    connect_entitlements: [],
    connect_purchase_grants: [],
    connect_transactions: [],
    connect_checkout_attempts: [],
    connect_subscription_checkouts: [],
    connect_customers: [],
  };
  const writes: { table: string; kind: string; value: any }[] = [];
  const admin = {
    async rpc(name: string, args: any) {
      if (name === "can_monetize_rocket_app")
        return { data: options.owner !== false, error: null };
      if (name !== "connect_reserve_subscription") throw new Error(name);
      let r = tables.connect_subscription_checkouts.find(
        (r) => r.user_id === args.p_user_id && r.client_id === args.p_client_id,
      );
      if (!r) {
        r = {
          user_id: args.p_user_id,
          client_id: args.p_client_id,
          product_id: args.p_product_id,
          stripe_account_id: args.p_account,
          origin: args.p_origin,
          idempotency_key: crypto.randomUUID(),
          expires_at: new Date(Date.now() + 31 * 60000).toISOString(),
          stripe_checkout_session_id: null,
        };
        tables.connect_subscription_checkouts.push(r);
      }
      return { data: { ...r }, error: null };
    },
    from(table: string) {
      const filters: ((r: any) => boolean)[] = [];
      let kind = "select",
        value: any,
        limit = Infinity,
        one = false,
        conflict = "";
      const run = () => {
        let rows = (tables[table] || [])
          .filter((r) => filters.every((f) => f(r)))
          .slice(0, limit);
        if (kind === "update") rows.forEach((r) => Object.assign(r, value));
        if (kind === "delete")
          tables[table] = (tables[table] || []).filter(
            (r) => !rows.includes(r),
          );
        if (kind === "upsert" || kind === "insert") {
          const match =
            kind === "upsert" &&
            (tables[table] || []).find((r) =>
              conflict.split(",").every((k) => r[k] === value[k]),
            );
          if (match) Object.assign(match, value);
          else (tables[table] ||= []).push({ ...value });
          rows = [match || value];
        }
        if (kind !== "select") writes.push({ table, kind, value });
        return {
          data: one ? rows[0] || null : rows.map((r) => ({ ...r })),
          error: null,
        };
      };
      const q: any = {
        select: () => q,
        range: () => q,
        eq: (k: string, v: any) => {
          filters.push((r) =>
            k === "connect_products.billing_type"
              ? products.find((p) => p.id === r.product_id)?.billing_type === v
              : r[k] === v,
          );
          return q;
        },
        neq: (k: string, v: any) => {
          filters.push((r) => r[k] !== v);
          return q;
        },
        in: (k: string, v: any[]) => {
          filters.push((r) => v.includes(r[k]));
          return q;
        },
        not: (k: string, _op: string, v: any) => {
          filters.push((r) => r[k] != v);
          return q;
        },
        gt: (k: string, v: any) => {
          filters.push((r) => r[k] > v);
          return q;
        },
        order: () => q,
        limit: (n: number) => {
          limit = n;
          return q;
        },
        single: () => {
          one = true;
          return Promise.resolve(run());
        },
        maybeSingle: () => {
          one = true;
          return Promise.resolve(run());
        },
        update: (v: any) => {
          kind = "update";
          value = v;
          return q;
        },
        delete: () => {
          kind = "delete";
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
          conflict = o?.onConflict || "id";
          return q;
        },
        then: (resolve: any) => Promise.resolve(run()).then(resolve),
      };
      return q;
    },
  };
  const sessions = new Map<string, any>(),
    calls: { params: any; options: any }[] = [],
    retrievals: { kind: string; id: string; options: any }[] = [];
  const subscriptions: Record<string, any> = {};
  class Stripe {
    prices = {
      retrieve: async (id: string, o: any) => {
        retrievals.push({ kind: "price", id, options: o });
        const p = products.find((p) => p.stripe_price_id === id)!;
        return {
          id,
          active: true,
          livemode: true,
          unit_amount: p.amount_cents,
          currency: p.currency,
          product: p.stripe_product_id,
          type: p.billing_type === "one_time" ? "one_time" : "recurring",
          recurring: p.interval
            ? {
                interval: p.interval,
                interval_count: 1,
                usage_type: "licensed",
              }
            : null,
        };
      },
    };
    subscriptions = {
      retrieve: async (id: string, o: any) => {
        retrievals.push({ kind: "subscription", id, options: o });
        return subscriptions[id] || { status: "active" };
      },
      update: async () => ({}),
    };
    customers = { create: async () => ({ id: "cus" }) };
    checkout = {
      sessions: {
        create: async (params: any, opts: any) => {
          calls.push({ params, options: opts });
          await Promise.resolve();
          if (!sessions.has(opts.idempotencyKey))
            sessions.set(opts.idempotencyKey, {
              id: `cs_${sessions.size}`,
              url: "https://checkout.stripe.com/fixture",
              status: "open",
              expires_at:
                params.expires_at || Math.floor(Date.now() / 1000) + 86400,
              mode: params.mode,
              metadata: params.metadata,
            });
          return sessions.get(opts.idempotencyKey);
        },
        retrieve: async (id: string, o: any) => {
          retrievals.push({ kind: "session", id, options: o });
          return (
            [...sessions.values()].find((s) => s.id === id) || {
              status: "expired",
            }
          );
        },
        list: async () => ({ data: [...sessions.values()] }),
      },
    };
  }
  let handler: (r: Request) => Promise<Response>;
  const compiled = ts.transpileModule(
    readFileSync(
      `supabase/functions/${options.endpoint || "rocket-buy"}/index.ts`,
      "utf8",
    ).replace(/^import .*;\n/gm, ""),
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  new Function(
    "Stripe",
    "APP_URL",
    "getAdmin",
    "getRocketUser",
    "getConnectToken",
    "json",
    "buyMerchantReadiness",
    "billingType",
    "priceMatches",
    "liveWebhookConfigured",
    "libraryPurchases",
    "sandboxLibraryPurchases",
    "Deno",
    "base64url",
    "createStripeConnectV2Merchant",
    "createStripeHostedOnboardingLink",
    "StripeConnectV2Error",
    "approvedPaymentReturn",
    "importableStripePrice",
    compiled,
  )(
    Stripe,
    "https://tryrocket.ai",
    () => admin,
    async () =>
      options.user === null
        ? null
        : { id: options.user || ids.buyer, email: "buyer@example.com" },
    async () => options.token || null,
    (v: any, status = 200) => new Response(JSON.stringify(v), { status }),
    async () => ({
      ready: options.ready !== false,
      chargesEnabled: true,
      payoutsEnabled: true,
      configuration: {},
    }),
    billingType,
    priceMatches,
    () => true,
    libraryPurchases,
    sandboxLibraryPurchases,
    {
      env: { get: () => "sk_live_fixture" },
      serve: (fn: typeof handler) => {
        handler = fn;
      },
    },
    () => "fixture",
    () => {},
    () => {},
    class extends Error {},
    approvedPaymentReturn,
    importableStripePrice,
  );
  const request = async (body: Record<string, unknown>) => {
    const response = await handler!(
      new Request("https://fixture/rocket-buy", {
        method: "POST",
        body: JSON.stringify({ app_id: ids.app, ...body }),
      }),
    );
    return { status: response.status, body: await response.json() };
  };
  return {
    request,
    tables,
    products,
    sessions,
    calls,
    retrievals,
    writes,
    subscriptions,
  };
}
