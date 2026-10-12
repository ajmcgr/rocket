import Stripe from "npm:stripe@16.12.0";
import { createClient } from "npm:@supabase/supabase-js@2.101.1";

// Read-only Stripe reconciliation. No checkout, refund, transfer, subscription
// or entitlement API is called here. A missing source or cost fails the run.
const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
const stripe = stripeKey?.startsWith("sk_live_") ? new Stripe(stripeKey, { apiVersion: "2024-06-20" }) : null;
const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
const id = (value: unknown) => typeof value === "string" ? value : value && typeof value === "object" && "id" in value ? String(value.id) : null;
const isInternal = (request: Request) => {
  const expected = Deno.env.get("POSTHOG_SYNC_SECRET");
  const received = request.headers.get("x-rocket-investor-sync");
  if (!expected || !received || expected.length !== received.length) return false;
  let difference = 0;
  for (let i = 0; i < expected.length; i++) difference |= expected.charCodeAt(i) ^ received.charCodeAt(i);
  return difference === 0;
};
const checked = async <T>(promise: PromiseLike<{ data: T; error: unknown }>): Promise<T> => {
  const result = await promise;
  if (result.error) throw result.error;
  return result.data;
};

async function settledCharge(intentId: string, account?: string, allowAdjusted = false) {
  if (!stripe) throw new Error("Stripe live key unavailable");
  const options = account ? { stripeAccount: account } : undefined;
  const intent = await stripe.paymentIntents.retrieve(intentId, {}, options);
  if (!intent.livemode || intent.status !== "succeeded" || !Number.isSafeInteger(intent.amount_received) || intent.amount_received <= 0) throw new Error("PaymentIntent not settled");
  const chargeId = id(intent.latest_charge);
  if (!chargeId) throw new Error("Settled charge missing");
  const charge = await stripe.charges.retrieve(chargeId, { expand: ["balance_transaction"] }, options);
  if (!charge.livemode || !charge.paid || !charge.captured || charge.payment_intent !== intent.id || charge.amount !== intent.amount_received || charge.currency !== intent.currency) throw new Error("Charge mismatch");
  if (!allowAdjusted && (charge.refunded || charge.disputed || charge.amount_refunded > 0)) throw new Error("Refunded or disputed charge needs adjustment reconciliation");
  const balance = charge.balance_transaction;
  if (!balance || typeof balance === "string" || balance.currency !== charge.currency || !Number.isSafeInteger(balance.fee) || balance.fee < 0) throw new Error("Processing cost unavailable");
  return { intent, charge, balance };
}

async function marketplaceRefunds(accountId: string, paymentKey: string, chargeId: string) {
  if (!stripe) throw new Error("Stripe live key unavailable");
  for await (const refund of stripe.refunds.list({ charge: chargeId, limit: 100 }, { stripeAccount: accountId })) {
    if (refund.status !== "succeeded") continue;
    await checked(service.rpc("rocket_record_marketplace_adjustment_by_key", {
      p_stripe_account_id: accountId, p_payment_key: paymentKey,
      p_adjustment_id: refund.id, p_kind: "REFUND", p_amount_cents: refund.amount,
      p_currency: refund.currency, p_occurred_at: new Date(refund.created * 1000).toISOString(),
    }));
  }
}
async function marketplaceDisputes(accountId: string, paymentKey: string, chargeId: string) {
  if (!stripe) throw new Error("Stripe live key unavailable");
  for await (const dispute of stripe.disputes.list({ charge: chargeId, limit: 100 }, { stripeAccount: accountId })) {
    if (dispute.status.startsWith("warning_")) continue;
    await checked(service.rpc("rocket_record_marketplace_adjustment_by_key", {
      p_stripe_account_id: accountId, p_payment_key: paymentKey,
      p_adjustment_id: dispute.id, p_kind: "DISPUTE", p_amount_cents: dispute.amount,
      p_currency: dispute.currency, p_occurred_at: new Date(dispute.created * 1000).toISOString(),
    }));
    if (dispute.status === "won") {
      const returnTransaction = (dispute.balance_transactions || []).find((entry) => entry.net > 0);
      if (!returnTransaction) throw new Error("Won dispute reinstatement date unavailable");
      await checked(service.rpc("rocket_record_marketplace_adjustment_by_key", {
        p_stripe_account_id: accountId, p_payment_key: paymentKey,
        p_adjustment_id: `${dispute.id}:won`, p_kind: "REVERSAL", p_amount_cents: dispute.amount,
        p_currency: dispute.currency, p_occurred_at: new Date(returnTransaction.created * 1000).toISOString(),
      }));
    }
  }
}

async function marketplacePayments(): Promise<number> {
  if (!stripe) throw new Error("Stripe live key unavailable");
  const clients = await checked(service.from("rocket_oauth_clients")
    .select("client_id").eq("environment", "production"));
  const clientIds = (clients || []).map((client) => client.client_id);
  if (!clientIds.length) return 0;
  const transactions = await checked(service.from("connect_transactions")
    .select("id,user_id,client_id,product_id,stripe_account_id,stripe_subscription_id,stripe_payment_intent_id")
    .in("client_id", clientIds));
  let recorded = 0;
  for (const transaction of transactions || []) {
    const product = await checked(service.from("connect_products")
      .select("id,billing_type,stripe_price_id,amount_cents,currency,platform_fee_bps")
      .eq("id", transaction.product_id).eq("client_id", transaction.client_id).single());
    if (!product) throw new Error("Marketplace offer mapping missing");
    if (product.billing_type === "one_time") {
      if (!transaction.stripe_payment_intent_id) continue;
      const { intent, charge } = await settledCharge(transaction.stripe_payment_intent_id, transaction.stripe_account_id, true);
      if (intent.amount_received !== product.amount_cents || intent.currency !== product.currency ||
        intent.metadata?.rocket_user_id !== transaction.user_id ||
        intent.metadata?.rocket_client_id !== transaction.client_id ||
        intent.metadata?.rocket_product_id !== product.id) throw new Error("Marketplace one-time payment mismatch");
      await checked(service.rpc("rocket_record_marketplace_payment", {
        p_transaction_id: transaction.id, p_payment_key: intent.id, p_invoice_id: null,
        p_payment_intent_id: intent.id, p_amount_cents: intent.amount_received,
        p_fee_cents: Math.round(intent.amount_received * product.platform_fee_bps / 10000),
        p_currency: intent.currency, p_paid_at: new Date(charge.created * 1000).toISOString(),
        p_source_event_id: null,
      }));
      await marketplaceRefunds(transaction.stripe_account_id, intent.id, charge.id);
      await marketplaceDisputes(transaction.stripe_account_id, intent.id, charge.id);
      recorded++;
      continue;
    }
    if (!transaction.stripe_subscription_id) continue;
    for await (const invoice of stripe.invoices.list({ subscription: transaction.stripe_subscription_id, limit: 100 },
      { stripeAccount: transaction.stripe_account_id })) {
      if (!invoice.livemode || invoice.status !== "paid" || invoice.amount_paid === 0) continue;
      if (invoice.currency !== product.currency || invoice.amount_paid > product.amount_cents ||
        invoice.lines?.has_more || invoice.lines?.data?.length !== 1 ||
        invoice.lines.data[0].price?.id !== product.stripe_price_id) throw new Error("Marketplace invoice product mismatch");
      const parent = (invoice as unknown as { parent?: { subscription_details?: { metadata?: Record<string,string> } } }).parent;
      const metadata = parent?.subscription_details?.metadata || invoice.subscription_details?.metadata || {};
      if (metadata.rocket_user_id !== transaction.user_id || metadata.rocket_client_id !== transaction.client_id ||
        metadata.rocket_product_id !== transaction.product_id) throw new Error("Marketplace invoice ownership mismatch");
      const intentId = id(invoice.payment_intent);
      if (!intentId) throw new Error("Marketplace invoice PaymentIntent missing");
      const { intent, charge } = await settledCharge(intentId, transaction.stripe_account_id, true);
      if (intent.amount_received !== invoice.amount_paid) throw new Error("Marketplace invoice amount mismatch");
      await checked(service.rpc("rocket_record_marketplace_payment", {
        p_transaction_id: transaction.id, p_payment_key: invoice.id,
        p_invoice_id: invoice.id, p_payment_intent_id: intent.id,
        p_amount_cents: invoice.amount_paid,
        p_fee_cents: Math.round(invoice.amount_paid * product.platform_fee_bps / 10000),
        p_currency: invoice.currency,
        p_paid_at: new Date((invoice.status_transitions?.paid_at || invoice.created) * 1000).toISOString(),
        p_source_event_id: null,
      }));
      await marketplaceRefunds(transaction.stripe_account_id, invoice.id, charge.id);
      await marketplaceDisputes(transaction.stripe_account_id, invoice.id, charge.id);
      recorded++;
    }
  }
  return recorded;
}

async function sponsorReceipts(): Promise<number> {
  const sponsors = await checked(service.from("rocket_sponsorships")
    .select("id,sponsorship_type,stripe_payment_intent_id,stripe_livemode,stripe_payment_status,paid_amount_cents,currency,paid_at,purchaser_user_id")
    .eq("stripe_livemode", true).eq("stripe_payment_status", "paid"));
  let recorded = 0;
  for (const sponsor of sponsors || []) {
    if (!sponsor.stripe_payment_intent_id || !sponsor.paid_at) throw new Error("Paid sponsorship missing Stripe identity");
    const { intent, charge, balance } = await settledCharge(sponsor.stripe_payment_intent_id);
    if (intent.amount_received !== sponsor.paid_amount_cents || intent.currency !== sponsor.currency) throw new Error("Sponsorship amount mismatch");
    const classification = await checked(service.rpc("rocket_investor_sponsorship_classification", { p_sponsorship_id: sponsor.id }));
    await checked(service.rpc("rocket_record_revenue_receipt", {
      p_payment_key: intent.id, p_source: sponsor.sponsorship_type === "featured_app" ? "FEATURED_APP" : "CATEGORY_SPONSOR",
      p_source_record_id: sponsor.id, p_amount_cents: intent.amount_received, p_cost_cents: balance.fee,
      p_currency: intent.currency, p_related_party: classification || "UNKNOWN",
      p_paid_at: new Date(charge.created * 1000).toISOString(), p_balance_transaction_id: balance.id,
    }));
    recorded++;
  }
  return recorded;
}

async function developerReceipts(): Promise<number> {
  if (!stripe) throw new Error("Stripe live key unavailable");
  const members = await checked(service.from("rocket_developer_memberships")
    .select("stripe_subscription_id,stripe_price_id").not("stripe_subscription_id", "is", null));
  let recorded = 0;
  for (const member of members || []) {
    if (!member.stripe_subscription_id) continue;
    for await (const invoice of stripe.invoices.list({ subscription: member.stripe_subscription_id, limit: 100 })) {
      if (!invoice.livemode || invoice.status !== "paid" || invoice.amount_paid === 0) continue;
      if (!invoice.lines?.data?.some((line) => line.price?.id === member.stripe_price_id) || invoice.lines?.has_more) throw new Error("Developer invoice price mismatch");
      const intentId = id(invoice.payment_intent);
      if (!intentId) throw new Error("Paid Developer invoice missing PaymentIntent");
      const { intent, balance } = await settledCharge(intentId);
      if (intent.amount_received !== invoice.amount_paid || intent.currency !== invoice.currency) throw new Error("Developer invoice amount mismatch");
      await checked(service.rpc("rocket_record_revenue_receipt", {
        p_payment_key: invoice.id, p_source: "DEVELOPER", p_source_record_id: member.stripe_subscription_id,
        p_amount_cents: invoice.amount_paid, p_cost_cents: balance.fee, p_currency: invoice.currency,
        p_related_party: "UNKNOWN", p_paid_at: new Date((invoice.status_transitions?.paid_at || intent.created) * 1000).toISOString(),
        p_balance_transaction_id: balance.id,
      }));
      recorded++;
    }
  }
  return recorded;
}

async function marketplaceFees(): Promise<number> {
  if (!stripe) throw new Error("Stripe live key unavailable");
  const pending = await checked(service.rpc("rocket_pending_marketplace_fees", {}));
  if (!Array.isArray(pending)) throw new Error("Marketplace fee queue unavailable");
  if (pending.length > 100) throw new Error("Marketplace fee reconciliation exceeds bounded batch");
  let recorded = 0;
  for (const row of pending) {
    let intentId = row.stripe_payment_intent_id;
    if (!intentId && row.stripe_invoice_id) {
      const invoice = await stripe.invoices.retrieve(row.stripe_invoice_id, { stripeAccount: row.stripe_account_id });
      intentId = id(invoice.payment_intent);
    }
    if (!intentId) throw new Error("Marketplace payment lacks PaymentIntent");
    const { charge } = await settledCharge(intentId, row.stripe_account_id, true);
    const feeId = id(charge.application_fee);
    if (!feeId) throw new Error("Marketplace application fee missing");
    const fee = await stripe.applicationFees.retrieve(feeId, { expand: ["balance_transaction"] });
    if (!fee.livemode || fee.amount !== row.application_fee_cents || fee.currency !== row.currency || fee.amount_refunded > 0) throw new Error("Marketplace fee mismatch or refund");
    const balance = fee.balance_transaction;
    if (!balance || typeof balance === "string" || !Number.isSafeInteger(balance.fee)) throw new Error("Marketplace fee cost missing");
    await checked(service.rpc("rocket_record_revenue_receipt", {
      p_payment_key: fee.id, p_source: "MARKETPLACE_FEE", p_source_record_id: row.id,
      p_amount_cents: fee.amount, p_cost_cents: balance.fee, p_currency: fee.currency,
      p_related_party: "UNKNOWN", p_paid_at: new Date(fee.created * 1000).toISOString(),
      p_balance_transaction_id: balance.id,
    }));
    recorded++;
  }
  return recorded;
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return reply({ error: "method_not_allowed" }, 405);
  if (!isInternal(request)) return reply({ error: "unauthorized" }, 401);
  if (!stripe) return reply({ error: "live_stripe_unavailable" }, 503);
  let sponsors = 0, developers = 0, fees = 0, marketplace = 0;
  try {
    const account = await stripe.accounts.retrieve();
    if (account.id !== "acct_1TfvwfL9pkHWyRRu") throw new Error("Rocket Stripe account mismatch");
    sponsors = await sponsorReceipts();
    developers = await developerReceipts();
    marketplace = await marketplacePayments();
    fees = await marketplaceFees();
    await checked(service.rpc("rocket_record_revenue_sync", { p_status: "COMPLETE", p_sponsors: sponsors, p_developers: developers, p_marketplace_fees: fees, p_error: null }));
    await checked(service.rpc("rocket_refresh_investor_snapshot", {}));
    return reply({ ok: true, sponsors, developers, marketplace_payments: marketplace, marketplace_fees: fees });
  } catch (error) {
    console.error("rocket-investor-sync", error);
    await service.rpc("rocket_record_revenue_sync", { p_status: "FAILED", p_sponsors: sponsors, p_developers: developers, p_marketplace_fees: fees, p_error: String(error) });
    return reply({ error: "reconciliation_failed" }, 500);
  }
});
