import { describe, expect, it, vi } from "vitest";
import {
  EscrowApiError,
  EscrowComClient,
  createPayload,
  inspectionDays,
  verifyAndMap,
  type EscrowTerms,
  type EscrowTransaction,
} from "../../supabase/functions/_shared/escrowCom";

const terms: EscrowTerms = {
  reference: "rk0123456789abcdef012345",
  appName: "Example app",
  buyerEmail: "buyer@example.com",
  sellerEmail: "seller@example.com",
  brokerEmail: "broker@tryrocket.ai",
  priceMinor: 1000000,
  buyerFeeMinor: 15000,
  sellerFeeMinor: 15000,
  inspectionDays: 7,
};
function transaction(): EscrowTransaction {
  const payload = createPayload(terms);
  return {
    id: 12345,
    reference: terms.reference,
    currency: "usd",
    parties: [
      { role: "buyer", customer: terms.buyerEmail, agreed: true },
      { role: "seller", customer: terms.sellerEmail, agreed: true },
      { role: "broker", customer: terms.brokerEmail, agreed: true },
    ],
    items: payload.items.map((item) => ({
      ...item,
      schedule: item.schedule.map((schedule) => ({
        ...schedule,
        beneficiary_customer:
          schedule.beneficiary_customer === "me"
            ? terms.brokerEmail
            : schedule.beneficiary_customer,
        status: { secured: false, disbursed_to_beneficiary: false },
      })),
    })),
  };
}
describe("Escrow.com adapter", () => {
  it("creates a USD brokered transaction using the locked buyer and seller fee split", () => {
    const payload = createPayload(terms);
    expect(payload.items.map((item) => item.type)).toEqual([
      "general_merchandise",
      "broker_fee",
      "broker_fee",
    ]);
    expect(payload.items.map((item) => item.schedule[0].amount)).toEqual([
      "10000.00",
      "150.00",
      "150.00",
    ]);
    expect(payload.items[0].inspection_period).toBe(7 * 86400);
    expect(payload.reference).toBe(terms.reference);
  });
  it("accepts only a whole 1 to 30 day inspection period", () => {
    expect(inspectionDays("7 days")).toBe(7);
    expect(inspectionDays("12 hours")).toBeNull();
    expect(inspectionDays("31 days")).toBeNull();
  });
  it("never treats payment sent as secured", () => {
    const t = transaction();
    t.items[0].schedule[0].status = { payment_sent: true, secured: false };
    expect(verifyAndMap(t, terms, "sandbox").funds_secured).toBe(false);
    expect(verifyAndMap(t, terms, "sandbox").status).toBe("awaiting_payment");
  });
  it("requires Escrow.com secured status before showing funding", () => {
    const t = transaction();
    t.items[0].schedule[0].status = { secured: true };
    expect(verifyAndMap(t, terms, "sandbox").status).toBe("funds_secured");
    t.items[0].status = { shipped: true };
    expect(verifyAndMap(t, terms, "sandbox").status).toBe("handover");
    t.items[0].status = { received: true };
    expect(verifyAndMap(t, terms, "sandbox").status).toBe("inspection");
  });
  it("does not report completion or Rocket fee collection until disbursement", () => {
    const t = transaction();
    t.close_date = "2026-11-20T00:00:00Z";
    t.items[0].schedule[0].status = { secured: true };
    expect(verifyAndMap(t, terms, "sandbox").completed).toBe(false);
    t.items[0].schedule[0].status.disbursed_to_beneficiary = true;
    expect(verifyAndMap(t, terms, "sandbox").status).toBe("completed");
    expect(verifyAndMap(t, terms, "sandbox").rocket_fee_disbursed_minor).toBe(
      0,
    );
    t.items[1].schedule[0].status!.disbursed_to_beneficiary = true;
    t.items[2].schedule[0].status!.disbursed_to_beneficiary = true;
    expect(verifyAndMap(t, terms, "sandbox").rocket_fee_disbursed_minor).toBe(
      30000,
    );
  });
  it("rejects mismatched parties or broker fee amounts", () => {
    const t = transaction();
    t.items[1].schedule[0].amount = "149.00";
    expect(() => verifyAndMap(t, terms, "sandbox")).toThrow(
      /broker fees mismatch/i,
    );
    t.items[1].schedule[0].amount = "150.00";
    t.parties[0].customer = "attacker@example.com";
    expect(() => verifyAndMap(t, terms, "sandbox")).toThrow(
      /parties mismatch/i,
    );
  });
  it("maps cancellation and provider-confirmed refund without inventing completion", () => {
    const t = transaction();
    t.is_cancelled = true;
    expect(verifyAndMap(t, terms, "sandbox").status).toBe("cancelled");
    t.items[0].schedule[0].status!.disbursed_to_payer = true;
    expect(verifyAndMap(t, terms, "sandbox").status).toBe("refunded");
    expect(verifyAndMap(t, terms, "sandbox").completed).toBe(false);
  });
  it("rejects a different provider reference", () => {
    const t = transaction();
    t.reference = "anothertransaction123";
    expect(() => verifyAndMap(t, terms, "sandbox")).toThrow(
      /identity mismatch/i,
    );
  });
  it("never retries a POST after a provider error", async () => {
    const fetcher = vi.fn(
      async () => new Response("temporary", { status: 503 }),
    );
    const api = new EscrowComClient(
      "sandbox",
      terms.brokerEmail,
      "test-secret",
      fetcher as typeof fetch,
    );
    await expect(api.create(terms)).rejects.toBeInstanceOf(EscrowApiError);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("routes live transactions only to the production API endpoint", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify(transaction()), {
      status: 200,
    }));
    const api = new EscrowComClient("production", terms.brokerEmail,
      "live-test-key", fetcher as typeof fetch);
    await api.create(terms);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toBe(
      "https://api.escrow.com/2017-09-01/transaction",
    );
  });
  it("checks the live account before an irreversible create claim", async () => {
    const fetcher = vi.fn(async () =>
      new Response(JSON.stringify({id: 123}), {status: 200}));
    const api = new EscrowComClient("production", terms.brokerEmail,
      "live-test-key", fetcher as typeof fetch);
    await api.verifyAccount();
    expect(fetcher.mock.calls[0][0]).toBe(
      "https://api.escrow.com/2017-09-01/customer/me",
    );
    const bad = new EscrowComClient("production", terms.brokerEmail,
      "bad-key", async () => new Response("Unauthorized", {status: 401}));
    await expect(bad.verifyAccount()).rejects.toBeInstanceOf(EscrowApiError);
  });
});
