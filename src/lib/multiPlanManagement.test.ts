// @vitest-environment node
import { describe, it, expect } from "vitest";
import { harness, ids } from "../../tests/commerce/endpointHarness";
const context = { endpoint: "rocket-buy-developer" as const, user: ids.owner };
describe("existing developer management authorization", () => {
  it("edits only the owner's display fields and entitlement key, never a supplied price/merchant", async () => {
    const h = harness(context);
    expect(
      (
        await h.request({
          action: "edit_plan",
          plan_id: ids.month,
          name: "Pro Plus",
          description: "More capacity",
          entitlement_key: "pro-plus",
          amount_cents: 1,
          stripe_price_id: "forged",
          developer_account_id: "forged",
        })
      ).status,
    ).toBe(200);
    expect(h.products[0]).toMatchObject({
      name: "Pro Plus",
      description: "More capacity",
      entitlement_key: "pro-plus",
      amount_cents: 1900,
      stripe_price_id: `price_${ids.month}`,
      developer_account_id: "merchant",
    });
  });
  it("cannot edit another merchant's offer ID", async () => {
    const h = harness(context);
    h.products[1].developer_account_id = "other";
    expect(
      (
        await h.request({
          action: "edit_plan",
          plan_id: ids.year,
          name: "Changed",
          description: "",
          entitlement_key: "other",
        })
      ).status,
    ).toBe(404);
    expect(h.products[1].name).toBe("Pro");
  });
  it("rejects missing ownership and cross-client requests before any update", async () => {
    const h = harness({ ...context, owner: false });
    expect(
      (await h.request({ action: "edit_plan", plan_id: ids.month })).status,
    ).toBe(403);
    expect(h.writes).toHaveLength(0);
    const g = harness(context);
    expect(
      (
        await g.request({
          action: "deactivate_plan",
          plan_id: ids.month,
          client_id: "another-app",
        })
      ).status,
    ).toBe(403);
    expect(g.writes).toHaveLength(0);
  });
  it("unpublishes an offer without changing purchases or access", async () => {
    const h = harness(context);
    h.tables.connect_entitlements.push({
      user_id: ids.buyer,
      client_id: "client",
      product_id: ids.month,
      status: "active",
    });
    expect(
      (await h.request({ action: "deactivate_plan", plan_id: ids.month }))
        .status,
    ).toBe(200);
    expect(h.products[0].is_active).toBe(false);
    expect(h.tables.connect_entitlements[0].status).toBe("active");
    expect(h.writes.every((w) => w.table === "connect_products")).toBe(true);
  });
});
