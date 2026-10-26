// Pure, fail-closed Subscription MRR calculation. Amounts are in Stripe minor
// units with six retained decimal places; no floating-point money arithmetic.
export const MRR_CALCULATION_VERSION = 2;
const SCALE = 1_000_000n;
const PERCENT = 100n * SCALE;

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
  unsupported_reasons: Record<string, number>;
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

// Only resolved, permanent percentage coupons have an unambiguous recurring
// contribution here. Unresolved IDs, temporary/fixed/stacked discounts still
// fail closed. A coupon's redemption validity does not revoke an applied discount.
function discountFactor(discounts: unknown[] | null | undefined, product: string, now: number): bigint | null {
  if (discounts == null) return PERCENT;
  if (!Array.isArray(discounts)) return null;
  if (discounts.length === 0) return PERCENT;
  if (discounts.length !== 1) return null;
  const discount = discounts[0] as Record<string, unknown> | null;
  if (!discount || typeof discount !== "object" || discount.object !== "discount"
    || typeof discount.start !== "number" || discount.start > now
    || (discount.end != null && (typeof discount.end !== "number" || discount.end <= now))) return null;
  const source = discount.source as Record<string, unknown> | undefined;
  const coupon = (discount.coupon || source?.coupon) as Record<string, unknown> | undefined;
  if (!coupon || typeof coupon !== "object") return null;
  const applies = coupon.applies_to as { products?: unknown } | undefined;
  if (applies != null) {
    if (!Array.isArray(applies.products) || !applies.products.every((id) => typeof id === "string")) return null;
    if (!applies.products.includes(product)) return PERCENT;
  }
  if (coupon.duration !== "forever" || coupon.amount_off != null
    || typeof coupon.percent_off !== "number" || !Number.isFinite(coupon.percent_off)
    || coupon.percent_off < 0 || coupon.percent_off > 100) return null;
  const off = parseMinor(String(coupon.percent_off));
  return off == null ? null : PERCENT - off;
}

function monthlyMinor(item: RevenueItem, mapping: MappedPrice, factor = PERCENT * PERCENT): bigint | null {
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
  const raw = price.unit_amount_decimal ?? (price.unit_amount == null ? null : String(price.unit_amount));
  if (raw == null) return null;
  const amount = parseMinor(raw);
  if (amount == null) return null;
  const months = BigInt(intervalCount) * (interval === "year" ? 12n : 1n);
  // Retain six decimal places in the minor unit. Fractional remainder below
  // that precision is rounded half-up only after quantity multiplication.
  const denominator = months * PERCENT * PERCENT;
  return (amount * BigInt(item.quantity) * factor + denominator / 2n) / denominator;
}

export function calculateSubscriptionMrr(
  subscriptions: RevenueSubscription[], mappings: MappedPrice[], nowSeconds: number,
): MrrResult[] {
  const byPrice = new Map(mappings.map((mapping) => [mapping.price_id, mapping]));
  const totals = new Map<string, { amount: bigint; included: number; excluded: number; unsupported: number; reasons: Record<string, number> }>();
  for (const mapping of mappings) if (!totals.has(mapping.currency))
    totals.set(mapping.currency, { amount: 0n, included: 0, excluded: 0, unsupported: 0, reasons: {} });
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
      let contribution = 0n;
      let unsupported = false;
      let reason = "unsupported_price";
      for (const { item, mapping } of entries) {
        const subscriptionFactor = discountFactor(subscription.discounts, mapping.product_id, nowSeconds);
        const itemFactor = discountFactor(item.discounts, mapping.product_id, nowSeconds);
        if (subscriptionFactor == null || itemFactor == null) {
          unsupported = true;
          reason = subscriptionFactor == null ? "subscription_discount" : "item_discount";
          break;
        }
        const amount = monthlyMinor(item, mapping, subscriptionFactor * itemFactor);
        if (amount == null) {
          unsupported = true;
          reason = Array.isArray(item.discounts) && item.discounts.length ? "item_discount"
            : item.quantity == null || !Number.isSafeInteger(item.quantity) || item.quantity < 0 ? "invalid_quantity"
            : "unsupported_price";
          break;
        }
        contribution += amount;
      }
      if (unsupported) { total.unsupported++; total.reasons[reason] = (total.reasons[reason] || 0) + 1; }
      else { total.amount += contribution; total.included++; }
    }
  }
  return [...totals].map(([currency, value]) => ({
    currency, mrr_minor: formatMinor(value.amount), included_subscriptions: value.included,
    excluded_subscriptions: value.excluded, unsupported_subscriptions: value.unsupported,
    verification_status: value.unsupported ? "unsupported" : "verified",
    unsupported_reasons: value.reasons,
  }));
}
