export type RevenueProvider = "polar" | "dodo";
export type RevenuePeriod = { start: string; end: string };
type RecordValue = Record<string, unknown>;

export function completeThirtyDayPeriod(now = new Date()): RevenuePeriod {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
  const start = new Date(end.getTime() - 29 * 86_400_000);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

export function verifiedProductIds(items: unknown, idField: "id" | "product_id", ownerField: "organization_id" | "business_id", ownerId: string): string[] {
  if (!Array.isArray(items) || items.length === 0 || items.length > 1000)
    throw new Error("The provider catalogue must contain 1–1000 products");
  const ids = items.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("Invalid provider product");
    const row = item as RecordValue;
    if (row[ownerField] !== ownerId || typeof row[idField] !== "string" || !row[idField])
      throw new Error("Provider product ownership could not be verified");
    return row[idField] as string;
  });
  if (new Set(ids).size !== ids.length) throw new Error("Duplicate provider products");
  return ids.sort();
}

export function verifiedPolarRevenue(response: unknown): number {
  if (!response || typeof response !== "object" || Array.isArray(response))
    throw new Error("Invalid Polar metrics response");
  const totals = (response as RecordValue).totals;
  if (!totals || typeof totals !== "object" || Array.isArray(totals))
    throw new Error("Polar did not return revenue totals");
  const value = (totals as RecordValue).revenue;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
    throw new Error("Polar revenue is not a supported nonnegative amount");
  return value;
}

// Dodo's payment list includes the brand and refund/dispute summaries. Reject
// ambiguous rows rather than presenting tax-inclusive or disputed money as a
// verified app revenue figure. The card names this metric "paid volume".
export function verifiedDodoPaidVolume(rows: unknown, brandId: string, period: RevenuePeriod): number {
  if (!Array.isArray(rows) || rows.length > 5000) throw new Error("Dodo payment history exceeds the safe limit");
  const start = Date.parse(`${period.start}T00:00:00.000Z`);
  const end = Date.parse(`${period.end}T23:59:59.999Z`);
  let total = 0;
  for (const item of rows) {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("Invalid Dodo payment");
    const row = item as RecordValue;
    const created = typeof row.created_at === "string" ? Date.parse(row.created_at) : NaN;
    if (row.brand_id !== brandId || !Number.isFinite(created) || created < start || created > end)
      throw new Error("Dodo payment scope could not be verified");
    if (row.status !== "succeeded") continue;
    if (row.currency !== "USD") throw new Error("Dodo payments use multiple currencies; this source cannot be verified yet");
    if (row.refund_status || row.dispute_status)
      throw new Error("Dodo has refunded or disputed payments; paid-volume verification is unavailable");
    if (typeof row.total_amount !== "number" || !Number.isSafeInteger(row.total_amount) || row.total_amount < 0)
      throw new Error("Dodo returned an invalid payment amount");
    total += row.total_amount;
    if (!Number.isSafeInteger(total)) throw new Error("Dodo payment total exceeds the safe limit");
  }
  return total;
}
