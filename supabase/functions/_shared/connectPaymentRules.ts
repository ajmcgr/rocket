export type AccessStatus = "active" | "canceling" | "past_due" | "expired" | "refunded" | "disputed";

// Snapshot webhooks from Basil onward put periods on subscription items.
// Resolve only the purchased price, never another item's billing period.
export function verifiedSubscriptionPeriodEnd(
  subscription: { current_period_end?: number; items?: { data?: Array<{ price?: { id?: string }; current_period_end?: number }> } },
  priceId: string,
): number | null {
  const matches = subscription.items?.data?.filter((item) => item.price?.id === priceId) || [];
  if (!priceId || matches.length !== 1) return null;
  const end = matches[0].current_period_end ?? subscription.current_period_end;
  return typeof end === "number" && Number.isSafeInteger(end) && end > 0 && end <= 8640000000000 ? end : null;
}

// USD plans use integer minor units. The registered rate also supports the
// unchanged historical 10% sandbox ledger; never substitute today's rate.
export function registeredApplicationFee(amountCents: number, basisPoints: number): number {
  if (!Number.isSafeInteger(amountCents) || amountCents < 0 ||
      !Number.isInteger(basisPoints) || basisPoints < 0 || basisPoints > 10000) {
    throw new Error("Invalid registered fee inputs");
  }
  return Math.round(amountCents * basisPoints / 10000);
}

// Subscription events can revoke or schedule a previously paid entitlement,
// but cannot create paid access. Only a validated invoice settlement can do so.
export function subscriptionAccessChange(
  stripeStatus: string,
  cancelAtPeriodEnd: boolean,
  currentTransactionStatus: string,
): AccessStatus | null {
  if (stripeStatus === "past_due" || stripeStatus === "unpaid") return "past_due";
  if (stripeStatus === "canceled" || stripeStatus === "incomplete_expired") return "expired";
  if (stripeStatus === "active" && (currentTransactionStatus === "paid" || currentTransactionStatus === "canceling")) {
    return cancelAtPeriodEnd ? "canceling" : "active";
  }
  return null;
}

export function isCurrentInvoiceFullyRefunded(
  fullyRefunded: boolean,
  refundedInvoiceId: string | null,
  currentInvoiceId: string | null,
): boolean {
  return fullyRefunded && !!refundedInvoiceId && refundedInvoiceId === currentInvoiceId;
}

export function verifiedPaidInvoicePeriodEnd(
  invoice: {
    status?: string;
    currency?: string;
    amount_paid?: number;
    lines?: { data?: Array<{ price?: { id?: string }; pricing?: { price_details?: { price?: string } }; amount?: number; period?: { end?: number } }> };
  },
  expected: { currency: string; amount_cents: number; stripe_price_id: string },
): number | null {
  if (invoice.status !== "paid" || invoice.currency !== expected.currency || invoice.amount_paid !== expected.amount_cents) return null;
  const line = invoice.lines?.data?.find((entry) =>
    (entry.price?.id ?? entry.pricing?.price_details?.price) === expected.stripe_price_id &&
    entry.amount === expected.amount_cents
  );
  return typeof line?.period?.end === "number" && line.period.end > 0 ? line.period.end : null;
}
