// Pure, fail-closed Subscription MRR calculation. Amounts are in Stripe minor
// units with six retained decimal places; no floating-point money arithmetic.
export const MRR_CALCULATION_VERSION = 1;
const SCALE = 1_000_000n;

export type MappedPrice = { price_id: string; product_id: string; currency: string };
export type RevenuePrice = {
  id: string; product: string | { id: string }; currency: string;
  unit_amount_decimal?: string | null; unit_amount?: number | null;
  billing_scheme?: string; transform_quantity?: unknown; tiers_mode?: unknown;
  recurring?: { interval?: string; interval_count?: number; usage_type?: string } | null;
};
export type RevenueItem = { price: RevenuePrice; quantity?: number | null; discounts?: unknown[] | null };
export type RevenueSubscription = {
  id: string; status: string; livemode: boolean; items: RevenueItem[];
  discounts?: unknown[] | null; pause_collection?: unknown;
  cancel_at_period_end?: boolean; cancel_at?: number | null;
};
export type MrrResult = {
  currency: string; mrr_minor: string; included_subscriptions: number;
  excluded_subscriptions: number; unsupported_subscriptions: number;
  verification_status: "verified" | "unsupported";
};

function parseMinor(value: string): bigint | null {
  if (!/^\d+(?:\.\d+)?$/.test(value)) return null;
  const [whole, rawFraction = ""] = value.split(".");
  const fraction = rawFraction.replace(/0+$/, "");
  if (fraction.length > 6) return null;
  return BigInt(whole) * SCALE + BigInt(fraction.padEnd(6, "0") || "0");
}

function formatMinor(value: bigint): string {
  const whole = value / SCALE;
  const fraction = String(value % SCALE).padStart(6, "0");
  return `${whole}.${fraction}`;
}

function monthlyMinor(item: RevenueItem, mapping: MappedPrice): bigint | null {
  const price = item.price;
  if (price.id !== mapping.price_id || price.currency !== mapping.currency
    || (typeof price.product === "string" ? price.product : price.product?.id) !== mapping.product_id
    || price.billing_scheme !== "per_unit" || price.transform_quantity != null
    || price.tiers_mode != null || price.recurring?.usage_type !== "licensed") return null;
  const interval = price.recurring?.interval;
  const intervalCount = price.recurring?.interval_count;
  if ((interval !== "month" && interval !== "year") || !Number.isSafeInteger(intervalCount)
    || !intervalCount || intervalCount < 1 || !Number.isSafeInteger(item.quantity)
    || item.quantity == null || item.quantity < 0) return null;
  if (Array.isArray(item.discounts) && item.discounts.length > 0) return null;
  const raw = price.unit_amount_decimal ?? (price.unit_amount == null ? null : String(price.unit_amount));
  if (raw == null) return null;
  const amount = parseMinor(raw);
  if (amount == null) return null;
  const months = BigInt(intervalCount) * (interval === "year" ? 12n : 1n);
  // Retain six decimal places in the minor unit. Fractional remainder below
  // that precision is rounded half-up only after quantity multiplication.
  return (amount * BigInt(item.quantity) + months / 2n) / months;
}

export function calculateSubscriptionMrr(
  subscriptions: RevenueSubscription[], mappings: MappedPrice[], nowSeconds: number,
): MrrResult[] {
  const byPrice = new Map(mappings.map((mapping) => [mapping.price_id, mapping]));
  const totals = new Map<string, { amount: bigint; included: number; excluded: number; unsupported: number }>();
  for (const mapping of mappings) if (!totals.has(mapping.currency))
    totals.set(mapping.currency, { amount: 0n, included: 0, excluded: 0, unsupported: 0 });
  for (const subscription of subscriptions) {
    const mapped = subscription.items.map((item) => ({ item, mapping: byPrice.get(item.price?.id) }))
      .filter((entry): entry is { item: RevenueItem; mapping: MappedPrice } => Boolean(entry.mapping));
    if (!mapped.length) continue;
    const byCurrency = new Map<string, typeof mapped>();
    for (const entry of mapped) byCurrency.set(entry.mapping.currency, [...(byCurrency.get(entry.mapping.currency) || []), entry]);
    for (const [currency, entries] of byCurrency) {
      const total = totals.get(currency)!;
      const active = subscription.status === "active" && !subscription.pause_collection
        && !(subscription.cancel_at_period_end && subscription.cancel_at != null && subscription.cancel_at <= nowSeconds);
      if (!active) { total.excluded++; continue; }
      // A discount applied to the subscription can span mapped and unmapped
      // items. V1 does not claim a verified number for that currency.
      if (Array.isArray(subscription.discounts) && subscription.discounts.length > 0) {
        total.unsupported++; continue;
      }
      let contribution = 0n;
      let unsupported = false;
      for (const { item, mapping } of entries) {
        const amount = monthlyMinor(item, mapping);
        if (amount == null) { unsupported = true; break; }
        contribution += amount;
      }
      if (unsupported) total.unsupported++;
      else { total.amount += contribution; total.included++; }
    }
  }
  return [...totals].map(([currency, value]) => ({
    currency, mrr_minor: formatMinor(value.amount), included_subscriptions: value.included,
    excluded_subscriptions: value.excluded, unsupported_subscriptions: value.unsupported,
    verification_status: value.unsupported ? "unsupported" : "verified",
  }));
}
