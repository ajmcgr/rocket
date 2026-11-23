import type { ValuationCurrency } from "./rocketValuation";

type RecordLike = Record<string, unknown>;
const record = (value: unknown): RecordLike => value && typeof value === "object" && !Array.isArray(value) ? value as RecordLike : {};
const recent = (value: unknown, days: number) => typeof value === "string" && Number.isFinite(Date.parse(value))
  && Date.now() - Date.parse(value) >= 0 && Date.now() - Date.parse(value) <= days * 86_400_000;
const validNumber = (value: unknown, min: number, max: number) => typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;

export function verifiedStripeMrr(status: unknown, currency: ValuationCurrency): number {
  const root = record(status), connection = record(root.connection);
  if (connection.status !== "active" || connection.livemode !== true || !recent(connection.last_successful_sync, 7))
    throw new Error("Sync a live Stripe revenue connection before importing.");
  if (root.revenue_scope !== "products") throw new Error("Select app-specific Stripe products before importing revenue. Whole-account totals may include other apps.");
  const points = Array.isArray(root.latest) ? root.latest.map(record) : [];
  if (points.length !== 1 || String(points[0].currency).toUpperCase() !== currency)
    throw new Error("Stripe revenue must have exactly one currency matching the calculator.");
  const point = points[0];
  if (point.verification_status !== "verified" || point.source_livemode !== true
    || !recent(point.observed_at, 7) || Number(point.unsupported_subscriptions || 0) !== 0)
    throw new Error("Stripe revenue is stale or has unsupported subscriptions.");
  const minor = Number(point.mrr_minor);
  if (!Number.isFinite(minor) || minor < 0 || minor > 1_000_000_000)
    throw new Error("Stripe revenue cannot be used for this estimate.");
  return Math.round(minor) / 100;
}

export type VerifiedGa4 = { sessions: number; activeUsers: number; organicSharePct: number; trafficGrowthPct: number | null; period: string };
export function verifiedGa4Metrics(status: unknown): VerifiedGa4 {
  const valuation = record(record(status).valuation);
  if (valuation.verified !== true || !validNumber(valuation.sessions, 0, 1_000_000_000)
    || !validNumber(valuation.active_users, 0, 1_000_000_000)
    || !validNumber(valuation.organic_search_share_pct, 0, 100)
    || (valuation.traffic_growth_pct !== null && !validNumber(valuation.traffic_growth_pct, -100, 500)))
    throw new Error("Google Analytics did not return a complete verified report.");
  const end = valuation.end_date;
  if (typeof end !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(end) || !recent(`${end}T00:00:00Z`, 3))
    throw new Error("Google Analytics report is stale.");
  return { sessions: valuation.sessions as number, activeUsers: valuation.active_users as number,
    organicSharePct: valuation.organic_search_share_pct as number,
    trafficGrowthPct: valuation.traffic_growth_pct as number | null,
    period: `${valuation.start_date} to ${end}` };
}
