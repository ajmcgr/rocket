import { describe, it, expect } from "vitest";
import { libraryPurchases, sandboxLibraryPurchases } from "../../supabase/functions/_shared/buyerLibrary";
const client = { client_id: "live", app_id: "app", environment: "production" },
  product = {
    id: "product",
    client_id: "live",
    name: "Pro",
    amount_cents: 5000,
    currency: "usd",
    interval: null,
  };
const entry = {
  purchase_id: "order",
  client_id: "live",
  product_id: "product",
  one_time: true,
  status: "granted",
  valid_until: null,
};
const order = {
  id: "order",
  client_id: "live",
  product_id: "product",
  amount_cents: 3900,
  currency: "usd",
  created_at: "2026-10-01",
  status: "paid",
};
describe("Buyer library ledger presentation", () => {
  it("shows only verified TEST receipts and never promotes them into live access", () => {
    const testClient = { client_id: "test", app_id: null, name: "Launch acceptance (test)", environment: "test" };
    const testProduct = { ...product, client_id: "test" };
    const testGrant = { ...entry, client_id: "test" };
    const testOrder = { ...order, client_id: "test" };
    expect(sandboxLibraryPurchases([testGrant], [testClient], [testProduct], [testOrder])).toMatchObject([
      { purchase_id: "order", app_name: "Launch acceptance (test)", product_name: "Pro", amount_cents: 3900 },
    ]);
    expect(sandboxLibraryPurchases([{ ...testGrant, status: "refunded" }], [testClient], [testProduct], [testOrder])).toEqual([]);
    expect(sandboxLibraryPurchases([testGrant], [testClient], [testProduct], [{ ...testOrder, status: "pending" }])).toEqual([]);
    expect(sandboxLibraryPurchases([testGrant], [testClient], [product], [testOrder])).toEqual([]);
    expect(libraryPurchases([testGrant], [testClient], [testProduct], [], [testOrder], [])).toEqual([]);
  });
  it("keeps hidden purchase history without leaking listing fields or an Open URL", () => {
    const [p] = libraryPurchases([entry], [client], [product], [], [order], []);
    expect(p).toMatchObject({
      purchase_id: "order",
      app_name: "Unavailable listing",
      website_url: null,
      listing_available: false,
      plan: { amount_cents: 3900 },
      order: { id: "order" },
    });
    expect(p.receipt_url).toBeNull();
  });
  it("preserves separate one-time units and rejects test clients/cross-client products", () => {
    expect(
      libraryPurchases(
        [entry, { ...entry, purchase_id: "order2" }],
        [client],
        [product],
        [],
        [order],
        [],
      ),
    ).toHaveLength(2);
    expect(
      libraryPurchases(
        [entry],
        [{ ...client, environment: "test" }],
        [product],
        [],
        [],
        [],
      ),
    ).toEqual([]);
    expect(
      libraryPurchases(
        [entry],
        [client],
        [{ ...product, client_id: "other" }],
        [],
        [],
        [],
      ),
    ).toEqual([]);
  });
  it("distinguishes revoked/refunded payments and expired subscriptions", () => {
    expect(
      libraryPurchases(
        [entry],
        [{ ...client, is_active: false }],
        [product],
        [],
        [],
        [],
      )[0].active,
    ).toBe(false);
    expect(
      libraryPurchases(
        [{ ...entry, status: "refunded" }],
        [client],
        [product],
        [],
        [],
        [],
      )[0].active,
    ).toBe(false);
    const [p] = libraryPurchases(
      [
        {
          ...entry,
          one_time: false,
          status: "active",
          valid_until: "2020-01-01",
        },
      ],
      [client],
      [{ ...product, interval: "month" }],
      [],
      [],
      [],
    );
    expect(p.active).toBe(false);
    expect(p.plan.billing_type).toBe("subscription");
  });
  it("uses only matching historical order details and public merchant support", () => {
    const [p] = libraryPurchases(
      [entry],
      [client],
      [product],
      [{ id: "app", name: "Public app", website_url: "https://example.com" }],
      [{ ...order, client_id: "foreign" }],
      [{ app_id: "app", support_url: "https://example.com/help" }],
    );
    expect(p.order).toBeNull();
    expect(p.support_url).toBe("https://example.com/help");
    expect(p.plan.amount_cents).toBe(5000);
  });
});
