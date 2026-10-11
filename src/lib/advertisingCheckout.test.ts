import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

const appId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const bookingId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const productId = "prod_canonical";
const priceId = "price_canonical";

function harness({ authenticated = true, canonical = true, owned = true, liveEnabled = true,
  type = "featured_app" as "featured_app" | "category_sponsor" } = {}) {
  let handler!: (request: Request) => Promise<Response>;
  const create = vi.fn().mockResolvedValue({
    id: "cs_live_approved", url: "https://checkout.stripe.com/c/approved", status: "open",
    expires_at: 1_800_000_000,
  });
  const expire = vi.fn().mockResolvedValue({ status: "expired" });
  const rpc = vi.fn(async (name: string) => name === "reserve_rocket_sponsorship"
      ? owned ? { data: { id: bookingId, scheduled_start_at: "2027-01-01T00:00:00Z",
        scheduled_end_at: type === "featured_app" ? "2027-01-08T00:00:00Z" : "2027-01-31T00:00:00Z" }, error: null }
      : { data: null, error: { message: "Eligible owned app required" } }
    : { data: name === "is_rocket_admin" ? false : true, error: null });
  const from = (table: string) => {
    const query: Record<string, unknown> = {};
    for (const method of ["select", "eq", "is", "limit", "update"])
      query[method] = () => query;
    query.maybeSingle = async () => ({ data: null, error: null });
    query.single = async () => ({ data: table === "rocket_sponsorship_prices"
      ? { live_product_id: productId, live_price_id: priceId }
      : { id: bookingId }, error: null });
    return query;
  };
  class StripeMock {
    accounts = { retrieve: async () => ({ id: "acct_1TfvwfL9pkHWyRRu" }) };
    products = { retrieve: async () => ({
      active: true, livemode: true, name: type === "featured_app" ? "Rocket Featured App" : "Rocket Category Sponsor",
      metadata: { rocket_product_type: type },
    }) };
    prices = { retrieve: async () => ({
      active: true, livemode: true, product: productId,
      unit_amount: canonical ? (type === "featured_app" ? 4900 : 29900) : 1,
      currency: "usd", type: "one_time",
    }) };
    checkout = { sessions: { create, expire } };
  }
  const client = { auth: { getUser: async () => ({
    data: { user: authenticated ? { id: appId, email: "buyer@example.com" } : null },
    error: authenticated ? null : { message: "Invalid token" },
  }) }, from, rpc };
  runInNewContext(ts.transpileModule(
    readFileSync("supabase/functions/rocket-advertising/index.ts", "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } },
  ).outputText, {
    exports: {}, Request, Response, URL, console,
    require: (name: string) => name.startsWith("npm:stripe")
      ? { default: StripeMock } : { createClient: () => client },
    Deno: { env: { get: (name: string) => ({
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service_mock",
      SUPABASE_ANON_KEY: "anon_mock",
      STRIPE_SECRET_KEY: "sk_live_mock",
      STRIPE_WEBHOOK_SECRET: "whsec_live_mock",
      ROCKET_ADVERTISING_LIVE_CHECKOUT_ENABLED: liveEnabled ? "true" : undefined,
    })[name as "STRIPE_SECRET_KEY"] }, serve: (fn: typeof handler) => { handler = fn; } },
  });
  const request = (body: object, authorized = true) => handler(new Request("https://example.com/rocket-advertising", {
    method: "POST", headers: authorized ? { Authorization: "Bearer mock" } : {},
    body: JSON.stringify(body),
  }));
  return { request, create, expire, rpc };
}

describe("Rocket-owned advertising Checkout", () => {
  it("keeps live checkout closed until acceptance is complete", async () => {
    const { request, create } = harness({ liveEnabled: false });
    expect((await request({ action: "checkout", type: "featured_app", app_id: appId })).status).toBe(503);
    expect(create).not.toHaveBeenCalled();
  });
  it("uses only the canonical $49 one-time price on Rocket, ignoring caller amount and fee overrides", async () => {
    const { request, create, rpc } = harness();
    const response = await request({ action: "checkout", type: "featured_app", app_id: appId,
      amount_cents: 1, price_id: "price_attacker", application_fee_amount: 0 });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(expect.objectContaining({
      start: "2027-01-01T00:00:00Z", end: "2027-01-08T00:00:00Z",
      checkout_expires_at: "2027-01-15T08:00:00.000Z",
    }));
    expect(create).toHaveBeenCalledOnce();
    const params = create.mock.calls[0][0];
    expect(params.mode).toBe("payment");
    expect(params.line_items).toEqual([{ price: priceId, quantity: 1 }]);
    expect(params).not.toHaveProperty("payment_intent_data.application_fee_amount");
    expect(params).not.toHaveProperty("transfer_data");
    expect(params.payment_intent_data.metadata.rocket_sponsorship_id).toBe(bookingId);
    expect(rpc).toHaveBeenCalledWith("reserve_rocket_sponsorship", expect.objectContaining({
      p_user_id: appId, p_livemode: true, p_type: "featured_app",
    }));
  });

  it("uses the canonical $299 one-time Category Sponsor price and server-selected 30-day window", async () => {
    const { request, create, rpc } = harness({ type: "category_sponsor" });
    const response = await request({ action: "checkout", type: "category_sponsor", app_id: appId,
      category: "Productivity", amount_cents: 1, duration_days: 1, price_id: "price_attacker" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(expect.objectContaining({
      start: "2027-01-01T00:00:00Z", end: "2027-01-31T00:00:00Z",
    }));
    expect(create).toHaveBeenCalledOnce();
    expect(create.mock.calls[0][0].line_items).toEqual([{ price: priceId, quantity: 1 }]);
    expect(rpc).toHaveBeenCalledWith("reserve_rocket_sponsorship", expect.objectContaining({
      p_type: "category_sponsor", p_category: "Productivity", p_livemode: true,
    }));
  });

  it("rejects an unauthenticated buyer before creating checkout", async () => {
    const { request, create } = harness({ authenticated: false });
    expect((await request({ action: "checkout", type: "featured_app", app_id: appId }, false)).status).toBe(401);
    expect(create).not.toHaveBeenCalled();
  });

  it("fails closed on a Stripe price mismatch", async () => {
    const { request, create, rpc } = harness({ canonical: false });
    expect((await request({ action: "checkout", type: "featured_app", app_id: appId })).status).toBe(503);
    expect(create).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalledWith("reserve_rocket_sponsorship", expect.anything());
  });

  it("rejects promotion of an app without verified ownership", async () => {
    const { request, create } = harness({ owned: false });
    expect((await request({ action: "checkout", type: "featured_app", app_id: appId })).status).toBe(409);
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects an unapproved test mode for a normal buyer", async () => {
    const { request, create } = harness();
    expect((await request({ action: "checkout", type: "featured_app", app_id: appId, mode: "test" })).status).toBe(403);
    expect(create).not.toHaveBeenCalled();
  });
});
