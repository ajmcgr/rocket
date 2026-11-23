import { describe, expect, it } from "vitest";
import { verifiedGa4Metrics, verifiedStripeMrr } from "./valuationVerifiedMetrics";

const now = new Date().toISOString();
const stripe = { connection: { status: "active", livemode: true, last_successful_sync: now },
  revenue_scope: "products", latest: [{ currency: "USD", mrr_minor: "123456", observed_at: now,
    verification_status: "verified", source_livemode: true, unsupported_subscriptions: 0 }] };
const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
const ga4 = { valuation: { verified: true, sessions: 4200, active_users: 3100,
  organic_search_share_pct: 47.5, traffic_growth_pct: 12.3, start_date: "2026-10-22", end_date: yesterday } };

describe("verified valuation imports", () => {
  it("accepts recent, app-specific live Stripe MRR in the selected currency", () => {
    expect(verifiedStripeMrr(stripe, "USD")).toBe(1234.56);
  });
  it("rejects whole-account, test, unsupported and mismatched currency revenue", () => {
    expect(() => verifiedStripeMrr({ ...stripe, revenue_scope: "account" }, "USD")).toThrow();
    expect(() => verifiedStripeMrr({ ...stripe, connection: { ...stripe.connection, livemode: false } }, "USD")).toThrow();
    expect(() => verifiedStripeMrr({ ...stripe, latest: [{ ...stripe.latest[0], unsupported_subscriptions: 1 }] }, "USD")).toThrow();
    expect(() => verifiedStripeMrr(stripe, "EUR")).toThrow();
  });
  it("rejects stale Stripe snapshots", () => {
    expect(() => verifiedStripeMrr({ ...stripe, latest: [{ ...stripe.latest[0], observed_at: "2026-01-01" }] }, "USD")).toThrow();
  });
  it("keeps active users distinct from sessions and accepts verified traffic sources", () => {
    expect(verifiedGa4Metrics(ga4)).toMatchObject({ sessions: 4200, activeUsers: 3100, organicSharePct: 47.5 });
  });
  it("rejects stale or unverified GA4 traffic", () => {
    expect(() => verifiedGa4Metrics({ valuation: { ...ga4.valuation, verified: false } })).toThrow();
    expect(() => verifiedGa4Metrics({ valuation: { ...ga4.valuation, end_date: "2026-01-01" } })).toThrow();
  });
});
