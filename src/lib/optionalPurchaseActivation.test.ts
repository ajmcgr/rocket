// @vitest-environment node
import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";
const OPTIONAL_TEST_APP_ID = "b202d75a-02ae-46e6-8419-5b3410cbaac8";
const OPTIONAL_TEST_PLAN_ID = "315fa89b-c31e-49e6-b05f-3a9f870cca19";
const source = ts.transpileModule(
  readFileSync(
    "supabase/functions/rocket-buy-developer/index.ts",
    "utf8",
  ).replace(/^import .*;\n/gm, ""),
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
).outputText;
async function activation({
  app = OPTIONAL_TEST_APP_ID,
  planId = OPTIONAL_TEST_PLAN_ID,
  live = true,
  merchant = true,
  price = true,
  owner = true,
} = {}) {
  const writes: string[] = [];
  const plan = {
    id: planId,
    platform_fee_bps: 500,
    integration_confirmed_at: null,
    stripe_price_id: "price",
    developer_account_id: "merchant",
  };
  const admin = {
    rpc: async () => ({ data: owner }),
    from(table: string) {
      const data =
        table === "rocket_oauth_clients"
          ? {
              client_id: "client",
              is_active: true,
              allowed_scopes: ["entitlements:read"],
            }
          : table === "connect_developer_accounts"
            ? {
                id: "merchant",
                ready: true,
                status: "active",
                charges_enabled: true,
                payouts_enabled: true,
              }
            : table === "rocket_buy_configuration"
              ? { live_checkout_enabled: live }
              : plan;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Fluent query mock for the real handler.
      const q: any = {
        select: () => q,
        eq: () => q,
        neq: () => q,
        limit: () => Promise.resolve({ data: [] }),
        maybeSingle: async () => ({ data }),
        single: async () => ({ data }),
        update: () => {
          writes.push(table);
          return q;
        },
        then: (resolve: (x: unknown) => unknown) =>
          Promise.resolve({ data, error: null }).then(resolve),
      };
      return q;
    },
  };
  class Stripe {
    prices = { retrieve: async () => ({}) };
  }
  let handler: (req: Request) => Promise<Response>;
  new Function(
    "Stripe",
    "APP_URL",
    "base64url",
    "getAdmin",
    "getRocketUser",
    "json",
    "createStripeConnectV2Merchant",
    "createStripeHostedOnboardingLink",
    "StripeConnectV2Error",
    "buyMerchantReadiness",
    "approvedPaymentReturn",
    "importableStripePrice",
    "priceMatches",
    "liveWebhookConfigured",
    "Deno",
    source,
  )(
    Stripe,
    "https://tryrocket.ai",
    () => "",
    () => admin,
    async () => ({ id: "owner" }),
    (value: unknown, status = 200) =>
      new Response(JSON.stringify(value), { status }),
    () => {},
    () => {},
    class extends Error {},
    async () => ({
      ready: merchant,
      chargesEnabled: true,
      payoutsEnabled: true,
    }),
    () => true,
    () => true,
    () => price,
    () => true,
    {
      env: { get: () => "sk_live_fixture" },
      serve: (fn: typeof handler) => {
        handler = fn;
      },
    },
  );
  const response = await handler!(
    new Request("https://example.test", {
      method: "POST",
      body: JSON.stringify({
        action: "activate_plan",
        app_id: app,
        plan_id: planId,
      }),
    }),
  );
  return { status: response.status, writes, body: await response.json() };
}
describe("Optional purchase testing for all apps", () => {
  it("activates the exact Launch Pro offer without setting fake verification proof", async () => {
    expect(await activation()).toMatchObject({
      status: 200,
      writes: ["connect_products"],
      body: { activated: true },
    });
  });
  it("allows other apps and plans to activate without purchase test proof", async () => {
    for (const options of [
      { app: "11111111-1111-4111-8111-111111111111" },
      { planId: "22222222-2222-4222-8222-222222222222" },
    ])
      expect(await activation(options)).toMatchObject({
        status: 200,
        writes: ["connect_products"],
        body: { activated: true },
      });
  });
  it("still rejects missing ownership, live readiness, merchant readiness and price mismatch", async () => {
    for (const options of [
      { owner: false },
      { live: false },
      { merchant: false },
      { price: false },
    ]) {
      const result = await activation(options);
      expect(result.status).toBeGreaterThanOrEqual(400);
      expect(result.writes).not.toContain("connect_products");
    }
  });
});
