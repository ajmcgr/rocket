// @vitest-environment node
import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, it, expect } from "vitest";
const compiled = ts.transpileModule(
  readFileSync(
    "supabase/functions/connect-entitlements/index.ts",
    "utf8",
  ).replace(/^import .*;\n/gm, ""),
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
).outputText;
function fixture(
  token: any = {
    user_id: "buyer",
    client_id: "client",
    scopes: ["entitlements:read"],
  },
) {
  const product = {
    product_key: "pro-month",
    entitlement_key: "pro",
    name: "Pro",
    interval: "month",
    billing_type: "subscription",
  };
  const tables: Record<string, any[]> = {
    connect_entitlements: [
      {
        user_id: "buyer",
        client_id: "client",
        product_id: "month",
        status: "active",
        valid_until: "2099-01-01",
        revoked_at: null,
        connect_products: product,
      },
      {
        user_id: "other",
        client_id: "client",
        product_id: "private",
        status: "active",
        connect_products: product,
      },
      {
        user_id: "buyer",
        client_id: "other-app",
        product_id: "other-app",
        status: "active",
        connect_products: product,
      },
    ],
    connect_purchase_grants: [
      {
        user_id: "buyer",
        client_id: "client",
        product_id: "one-time",
        purchase_id: "purchase",
        status: "granted",
        quantity: 1,
        connect_products: {
          ...product,
          billing_type: "one_time",
          product_key: "lifetime",
          entitlement_key: "lifetime",
        },
        connect_transactions: {
          user_id: "buyer",
          client_id: "client",
          product_id: "one-time",
          status: "paid",
          amount_cents: 3900,
          currency: "usd",
        },
      },
    ],
    rocket_oauth_clients: [
      { client_id: "client", environment: "production", app_id: "app" },
    ],
  };
  let handler: (r: Request) => Promise<Response>;
  const admin = {
    from: (name: string) => {
      const filters: ((r: any) => boolean)[] = [];
      const get = (r: any, k: string) =>
        k.split(".").reduce((x: any, key) => x?.[key], r);
      const result = () => ({
        data: tables[name].filter((r) => filters.every((f) => f(r))),
        error: null,
      });
      const q: any = {
        select: () => q,
        eq: (k: string, v: any) => {
          filters.push((r) => get(r, k) === v);
          return q;
        },
        single: async () => ({ ...result(), data: result().data[0] }),
        then: (resolve: any) => Promise.resolve(result()).then(resolve),
      };
      return q;
    },
  };
  new Function("getAdmin", "getConnectToken", "json", "Deno", compiled)(
    () => admin,
    async () => token,
    (body: any, status = 200) => new Response(JSON.stringify(body), { status }),
    { serve: (fn: typeof handler) => (handler = fn) },
  );
  return {
    tables,
    request: async (search = "") => {
      const response = await handler!(
        new Request(`https://fixture/connect-entitlements${search}`),
      );
      return { status: response.status, body: await response.json() };
    },
  };
}
describe("plan entitlement contract and legacy compatibility", () => {
  it("returns only this authenticated client and buyer's plan, with expiry and revocation", async () => {
    const r = await fixture().request();
    expect(r.body.entitlements).toHaveLength(1);
    expect(r.body.entitlements[0]).toMatchObject({
      offer_id: "month",
      entitlement_key: "pro",
      product_key: "pro-month",
      interval: "month",
      active: true,
      valid_until: "2099-01-01",
      revoked_at: null,
    });
    expect(r.body.app_id).toBe("app");
  });
  it("supports a shared tier key and preserves exact legacy product-key filtering", async () => {
    const h = fixture();
    expect(
      (await h.request("?entitlement_key=pro")).body.entitlements,
    ).toHaveLength(1);
    expect(
      (await h.request("?product_key=missing")).body.entitlements,
    ).toHaveLength(0);
    expect(
      (await h.request("?product_key=pro-month")).body.entitlements,
    ).toHaveLength(1);
  });
  it.each(["past_due", "expired", "refunded", "disputed", "revoked"])(
    "never grants access for %s",
    async (status) => {
      const h = fixture();
      h.tables.connect_entitlements[0].status = status;
      expect((await h.request()).body.entitlements[0].active).toBe(false);
    },
  );
  it("denies expired or explicitly revoked active records", async () => {
    for (const patch of [
      { valid_until: "2000-01-01" },
      { revoked_at: "2026-01-01" },
    ]) {
      const h = fixture();
      Object.assign(h.tables.connect_entitlements[0], patch);
      expect((await h.request()).body.entitlements[0].active).toBe(false);
    }
  });
  it("requires both a paid transaction and a granted one-time entitlement", async () => {
    const h = fixture();
    expect((await h.request()).body.purchases[0].verified_paid).toBe(true);
    h.tables.connect_purchase_grants[0].connect_transactions.status =
      "refunded";
    expect((await h.request()).body.purchases[0].verified_paid).toBe(false);
    h.tables.connect_purchase_grants[0].connect_transactions.user_id = "other";
    expect((await h.request()).body.purchases).toHaveLength(0);
  });
  it("rejects missing or insufficient OAuth scope", async () => {
    expect((await fixture(null).request()).status).toBe(401);
    expect(
      (
        await fixture({
          user_id: "buyer",
          client_id: "client",
          scopes: [],
        }).request()
      ).status,
    ).toBe(403);
  });
});
