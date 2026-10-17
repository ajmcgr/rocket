// @vitest-environment node
import { describe, it, expect } from "vitest";
import { harness, ids } from "../../tests/commerce/endpointHarness";

describe("real multi-plan checkout handler with isolated Stripe fixture", () => {
  it("publishes all eligible offers and never picks an arbitrary default", async () => {
    const h = harness();
    const r = await h.request({ action: "catalog" });
    expect(r.body.plan).toBeNull();
    expect(r.body.plans).toHaveLength(3);
    expect((await h.request({ action: "checkout" })).body.error).toBe(
      "offer_selection_required",
    );
    expect(h.calls).toHaveLength(0);
  });
  it("does not contact Stripe checkout when the selected entitlement changed before intent registration", async () => {
    const h=harness({freeze:false});
    expect((await h.request({action:"checkout",offer_id:ids.month})).body.error).toBe("checkout_offer_changed");
    expect(h.calls).toHaveLength(0);
  });
  it("never recycles an uncertain one-time intent after Stripe idempotency expiry", async () => {
    const h=harness();
    h.tables.connect_checkout_attempts.push({user_id:ids.buyer,client_id:"client",product_id:ids.once,stripe_account_id:"acct_merchant",idempotency_key:`rocket-buy-production-${ids.buyer}-client-${ids.once}-${ids.buyer}`,expires_at:new Date(0).toISOString(),stripe_checkout_session_id:null});
    expect((await h.request({action:"checkout",offer_id:ids.once,product_key:"once",purchase_request_id:ids.buyer,return_uri:"https://merchant.example/paid"})).body.error).toBe("checkout_pending_reconciliation");
    expect(h.calls).toHaveLength(0);
  });
  it("uses the exact annual price, merchant, fee and entitlement, ignoring forged amounts", async () => {
    const h = harness();
    expect(
      (
        await h.request({
          action: "checkout",
          offer_id: ids.year,
          amount_cents: 1,
          stripe_price_id: "price_forged",
          platform_fee_bps: 0,
        })
      ).status,
    ).toBe(200);
    expect(h.calls[0]).toMatchObject({
      params: {
        mode: "subscription",
        line_items: [{ price: `price_${ids.year}`, quantity: 1 }],
        subscription_data: {
          application_fee_percent: 5,
          metadata: {
            rocket_user_id: ids.buyer,
            rocket_client_id: "client",
            rocket_product_id: ids.year,
            rocket_entitlement_key: "pro",
          },
        },
      },
      options: { stripeAccount: "acct_merchant" },
    });
  });
  it("supports legacy single-offer checkout without a new selector", async () => {
    const h = harness();
    h.tables.connect_products = h.products.slice(0, 1);
    expect((await h.request({ action: "checkout" })).status).toBe(200);
    expect(h.calls[0].params.metadata.rocket_product_id).toBe(ids.month);
  });
  it.each(["not-an-offer", "99999999-9999-4999-8999-999999999999"])(
    "rejects cross-app or nonexistent offer %s",
    async (offer_id) => {
      const h = harness();
      expect((await h.request({ action: "checkout", offer_id })).status).toBe(
        409,
      );
      expect(h.calls).toHaveLength(0);
    },
  );
  it("does not substitute another plan for an unpublished offer", async () => {
    const h = harness();
    h.products[0].is_active = false;
    expect(
      (await h.request({ action: "checkout", offer_id: ids.month })).body.error,
    ).toBe("offer_not_published");
  });
  it("filters another merchant's offers", async () => {
    const h = harness();
    h.products[1].developer_account_id = "other";
    expect(
      (await h.request({ action: "checkout", offer_id: ids.year })).status,
    ).toBe(409);
  });
  it.each([{ owner: false }, { ready: false }, { enabled: false }])(
    "fails closed when commercial readiness is missing %j",
    async (options) => {
      const h = harness(options);
      expect(
        (await h.request({ action: "checkout", offer_id: ids.month })).status,
      ).toBe(409);
      expect(h.calls).toHaveLength(0);
    },
  );
  it("requires buyer authentication and prohibits self-purchase", async () => {
    expect(
      (
        await harness({ user: null }).request({
          action: "checkout",
          offer_id: ids.month,
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await harness({ user: ids.owner }).request({
          action: "checkout",
          offer_id: ids.month,
        })
      ).status,
    ).toBe(403);
  });
  it("rejects a token bound to another developer client", async () => {
    const h = harness({
      user: null,
      token: {
        user_id: ids.buyer,
        client_id: "other",
        scopes: ["entitlements:read"],
      },
    });
    expect(
      (await h.request({ action: "checkout", offer_id: ids.month })).status,
    ).toBe(403);
  });
  it("reuses one subscription intent across concurrent requests and rejects other tiers", async () => {
    const h = harness();
    const r = await Promise.all([
      h.request({ action: "checkout", offer_id: ids.month }),
      h.request({ action: "checkout", offer_id: ids.year }),
      h.request({ action: "checkout", offer_id: ids.month }),
    ]);
    expect(r.map((x) => x.status).sort()).toEqual([200, 200, 409]);
    expect(h.sessions.size).toBe(1);
    expect(new Set(h.calls.map((c) => c.options.idempotencyKey)).size).toBe(1);
  });
  it("blocks another plan while an existing subscription is active, even with an old merchant", async () => {
    const h = harness();
    h.tables.connect_transactions.push({
      user_id: ids.buyer,
      client_id: "client",
      product_id: ids.year,
      stripe_account_id: "acct_old",
      stripe_subscription_id: "sub",
    });
    expect(
      (await h.request({ action: "checkout", offer_id: ids.month })).body.error,
    ).toBe("existing_subscription_needs_attention");
    expect(h.retrievals).toContainEqual({
      kind: "subscription",
      id: "sub",
      options: { stripeAccount: "acct_old" },
    });
  });
  it("does not mistake a different buyer's subscription for this buyer's", async () => {
    const h = harness();
    h.tables.connect_transactions.push({
      user_id: ids.owner,
      client_id: "client",
      product_id: ids.month,
      stripe_account_id: "acct_merchant",
      stripe_subscription_id: "sub",
    });
    expect(
      (await h.request({ action: "checkout", offer_id: ids.month })).status,
    ).toBe(200);
  });
  it("keeps the reservation when a request is uncertain instead of recycling it by time", async () => {
    const h = harness();
    h.tables.connect_subscription_checkouts.push({
      user_id: ids.buyer,
      client_id: "client",
      product_id: ids.month,
      stripe_account_id: "acct_merchant",
      idempotency_key: "uncertain",
      expires_at: new Date(0).toISOString(),
      stripe_checkout_session_id: null,
      origin: "ROCKET_MARKETPLACE",
    });
    expect(
      (await h.request({ action: "checkout", offer_id: ids.month })).body.error,
    ).toBe("checkout_pending_reconciliation");
    expect(h.calls).toHaveLength(0);
  });
  it("validates one-time return destinations and preserves request replay protection", async () => {
    const h = harness();
    const body = {
      action: "checkout",
      offer_id: ids.once,
      product_key: "once",
      purchase_request_id: ids.buyer,
      return_uri: "https://evil.example",
    };
    expect((await h.request(body)).body.error).toBe("invalid_return_uri");
    body.return_uri = "https://merchant.example/paid";
    expect((await h.request(body)).status).toBe(200);
    expect((await h.request(body)).body.reused).toBe(true);
    expect(h.calls).toHaveLength(1);
    expect(h.calls[0].params.payment_intent_data.application_fee_amount).toBe(
      195,
    );
    expect(h.calls[0].params.success_url).toBe(body.return_uri);
  });
  it("records developer-site attribution on canonical checkout metadata and ledger attempts", async () => {
    const h = harness();
    await h.request({
      action: "checkout",
      offer_id: ids.year,
      source: "developer_website",
    });
    expect(h.calls[0].params.metadata.rocket_origin).toBe("EXTERNAL_BUTTON");
    expect(h.tables.connect_checkout_attempts[0].origin).toBe(
      "EXTERNAL_BUTTON",
    );
  });
  it("does not grant access from returning to checkout or starting a session", async () => {
    const h = harness();
    await h.request({
      action: "checkout",
      offer_id: ids.year,
      purchase: "paid",
    });
    expect(
      h.writes.some(
        (w) =>
          w.table === "connect_entitlements" ||
          w.table === "connect_purchase_grants",
      ),
    ).toBe(false);
  });
});
