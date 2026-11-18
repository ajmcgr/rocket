import { describe, expect, it } from "vitest";
import { centsFromInput, money, nextAction, type Deal, type Offer } from "./rocketDeals";

const deal = (status: Deal["status"]): Deal => ({
  id: "deal", app_id: "app", buyer_id: "buyer", seller_id: "seller", conversation_id: "conversation", status, updated_at: "2026-11-18T00:00:00Z",
});
const offer = (actor_id: string): Offer => ({
  id: "offer", deal_id: "deal", actor_id, amount_cents: 12345, currency: "USD", message: "", conditions: "", handover_timeframe: "", created_at: "2026-11-18T00:00:00Z",
});
describe("Rocket Deals amounts", () => {
  it("converts decimal input to integer cents without floating point arithmetic", () => {
    expect(centsFromInput("0.99")).toBeNull();
    expect(centsFromInput("1")).toBeNull();
    expect(centsFromInput("49.50")).toBe(4950);
    expect(centsFromInput("123.45")).toBe(12345);
    expect(centsFromInput("1.234")).toBeNull();
    expect(centsFromInput("1e5")).toBeNull();
    expect(centsFromInput("1000000001")).toBeNull();
    expect(centsFromInput("1000", "JPY")).toBe(1000);
    expect(centsFromInput("1000.1", "JPY")).toBeNull();
    expect(centsFromInput("100.125", "KWD")).toBe(100125);
    expect(centsFromInput("100.1254", "KWD")).toBeNull();
    expect(money(100125, "KWD")).toContain("100.125");
  });
});
describe("Rocket Deals next action", () => {
  it("points counteroffers to the receiving party", () => {
    expect(nextAction(deal("negotiating"),"buyer",[offer("seller")],[],[],[])).toBe("Review offer");
    expect(nextAction(deal("negotiating"),"seller",[offer("seller")],[],[],[])).toBe("Await response");
  });
  it("asks the user to approve only the latest document version", () => {
    const agreements = [{id:"old",version:1,editor_id:"seller",created_at:"",terms:{}}, {id:"new",version:2,editor_id:"buyer",created_at:"",terms:{}}];
    const checklists = [{id:"list",version:1,editor_id:"seller",created_at:"",items:[]}];
    const approvals = [{deal_id:"deal",kind:"agreement" as const,version:1,user_id:"buyer",approved_at:""}];
    expect(nextAction(deal("awaiting_approvals"),"buyer",[offer("buyer")],agreements,checklists,approvals)).toBe("Approve transaction terms");
  });
});
