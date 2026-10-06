export type BillingType = "subscription" | "one_time";
export const billingType = (product: { billing_type?: string }) => product.billing_type || "subscription";

export function approvedPaymentReturn(uri: unknown, redirects: string[]): uri is string {
  if (typeof uri !== "string" || uri.length > 2048) return false;
  try {
    const url = new URL(uri);
    return url.protocol === "https:" && !url.username && !url.password && !url.hash &&
      redirects.some(value => new URL(value).origin === url.origin);
  } catch { return false; }
}

export function priceMatches(product: any, price: any, production: boolean) {
  return price.livemode === production && price.active === true &&
    price.unit_amount === product.amount_cents && price.currency === product.currency &&
    price.product === product.stripe_product_id &&
    (billingType(product) === "one_time"
      ? price.type === "one_time" && !price.recurring
      : price.recurring?.interval === product.interval);
}

// Called only from the signature-verified webhook, on freshly retrieved objects
// in the same connected-account context. No callback/body amount is trusted.
export function verifiedOneTimePayment(session: any, intent: any, lines: any, product: any, attempt: any, production: boolean) {
  const metadataMatches = (metadata: any) => metadata?.rocket_user_id === attempt.user_id &&
    metadata?.rocket_client_id === attempt.client_id && metadata?.rocket_product_id === product.id;
  const items = lines?.data;
  return billingType(product) === "one_time" && product.client_id === attempt.client_id &&
    session.id === attempt.stripe_checkout_session_id && session.mode === "payment" &&
    session.status === "complete" && session.payment_status === "paid" &&
    session.livemode === production && !session.subscription &&
    session.amount_total === product.amount_cents && session.currency === product.currency &&
    metadataMatches(session.metadata) && metadataMatches(intent.metadata) &&
    typeof session.payment_intent === "string" && session.payment_intent === intent.id &&
    intent.status === "succeeded" && intent.livemode === production &&
    intent.amount === product.amount_cents && intent.amount_received === product.amount_cents &&
    intent.currency === product.currency &&
    intent.latest_charge && typeof intent.latest_charge === "object" &&
    intent.latest_charge.payment_intent === intent.id && intent.latest_charge.paid === true &&
    intent.latest_charge.captured === true && intent.latest_charge.livemode === production &&
    intent.application_fee_amount === Math.round(product.amount_cents * product.platform_fee_bps / 10000) &&
    !lines?.has_more && Array.isArray(items) && items.length === 1 && items[0].quantity === 1 &&
    items[0].price?.id === product.stripe_price_id && items[0].price?.product === product.stripe_product_id &&
    items[0].amount_total === product.amount_cents && items[0].currency === product.currency;
}
