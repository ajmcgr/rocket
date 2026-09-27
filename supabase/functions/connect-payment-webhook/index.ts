import Stripe from "npm:stripe@16.12.0";
import { getAdmin } from "../_shared/rocketConnect.ts";

const key = Deno.env.get("STRIPE_CONNECT_TEST_SECRET_KEY");
const secret = Deno.env.get("STRIPE_CONNECT_TEST_WEBHOOK_SECRET");
const stripe = key?.startsWith("sk_test_") ? new Stripe(key, { apiVersion: "2024-06-20" }) : null;
const reply = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });

function periodEnd(subscription: any) { return subscription.current_period_end ? new Date(subscription.current_period_end * 1000).toISOString() : null; }

function subscriptionIdFrom(object: any) {
  if (object?.object === "subscription") return typeof object.id === "string" ? object.id : null;
  if (typeof object?.subscription === "string") return object.subscription;
  const currentSubscription = object?.parent?.subscription_details?.subscription;
  return typeof currentSubscription === "string" ? currentSubscription : null;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return reply({ error: "method_not_allowed" }, 405);
  if (!stripe || !secret) return reply({ error: "connect_test_mode_not_configured" }, 503);
  const signature = req.headers.get("stripe-signature");
  if (!signature) { console.error("connect-webhook: missing Stripe signature"); return reply({ error: "missing_signature" }, 400); }
  let event: Stripe.Event;
  try { event = await stripe.webhooks.constructEventAsync(await req.text(), signature, secret); }
  catch { console.error("connect-webhook: invalid Stripe signature"); return reply({ error: "invalid_signature" }, 400); }
  const accountId = event.account;
  if (!accountId) { console.error(`connect-webhook: missing connected account context for ${event.type}`); return reply({ error: "not_connect_event" }, 400); }
  const admin = getAdmin();
  const { data: account } = await admin.from("connect_developer_accounts").select("id,client_id,stripe_account_id,status").eq("stripe_account_id", accountId).maybeSingle();
  if (!account) { console.error(`connect-webhook: unregistered connected account ${accountId}`); return reply({ error: "unknown_connected_account" }, 400); }
  const { error: received } = await admin.from("connect_webhook_events").insert({ event_id: event.id, stripe_account_id: accountId, event_type: event.type, event_created_at: new Date(event.created * 1000).toISOString(), processing_result: "stale", detail: {} });
  const isDuplicate = received?.code === "23505";
  // Permit recovery only for payment-settlement events that can legitimately
  // have reached the receipt ledger before their downstream state transition.
  if (isDuplicate && !["invoice.paid", "charge.refunded"].includes(event.type)) return reply({ received: true, duplicate: true });
  if (received && !isDuplicate) return reply({ error: "event_record_failed" }, 500);
  try {
    const object: any = event.data.object;
    let transaction: any = null;
    if (isDuplicate && event.type === "invoice.paid") {
      const subscriptionId = subscriptionIdFrom(object);
      if (!subscriptionId) return reply({ received: true, duplicate: true });
      const { data: existing } = await admin.from("connect_transactions").select("status").eq("stripe_account_id", accountId).eq("stripe_subscription_id", subscriptionId).maybeSingle();
      if (!existing || existing.status === "paid") return reply({ received: true, duplicate: true });
    }
    if (event.type === "checkout.session.completed") {
      const { data: attempt } = await admin.from("connect_checkout_attempts").select("*").eq("stripe_checkout_session_id", object.id).eq("stripe_account_id", accountId).maybeSingle();
      if (!attempt || object.mode !== "subscription" || object.payment_status !== "paid") throw new Error("Unmapped or unpaid checkout");
      const { data: product } = await admin.from("connect_products").select("*").eq("id", attempt.product_id).eq("client_id", attempt.client_id).maybeSingle();
      if (!product) throw new Error("Missing registered product");
      const { data, error } = await admin.from("connect_transactions").upsert({ user_id: attempt.user_id, client_id: attempt.client_id, product_id: attempt.product_id, developer_account_id: account.id, stripe_account_id: accountId, stripe_checkout_session_id: object.id, stripe_customer_id: typeof object.customer === "string" ? object.customer : null, stripe_subscription_id: typeof object.subscription === "string" ? object.subscription : null, amount_cents: product.amount_cents, application_fee_cents: Math.round(product.amount_cents * product.platform_fee_bps / 10000), currency: product.currency, status: "pending", stripe_event_created_at: new Date(event.created * 1000).toISOString() }, { onConflict: "stripe_checkout_session_id" }).select().single();
      if (error) throw error; transaction = data;
    } else if (subscriptionIdFrom(object)) {
      const subscriptionId = subscriptionIdFrom(object)!;
      const { data } = await admin.from("connect_transactions").select("*").eq("stripe_account_id", accountId).eq("stripe_subscription_id", subscriptionId).maybeSingle(); transaction = data;
    } else if (typeof object.invoice === "string") {
      // Charge events do not carry the subscription ID. Resolve their invoice
      // in the same connected-account context rather than trusting metadata or
      // performing a broad customer lookup.
      const invoice = await stripe.invoices.retrieve(object.invoice, { stripeAccount: accountId });
      const subscriptionId = subscriptionIdFrom(invoice);
      if (subscriptionId) {
        const { data } = await admin.from("connect_transactions").select("*").eq("stripe_account_id", accountId).eq("stripe_subscription_id", subscriptionId).maybeSingle(); transaction = data;
      }
    } else if (object.payment_intent) {
      const { data } = await admin.from("connect_transactions").select("*").eq("stripe_account_id", accountId).eq("stripe_payment_intent_id", object.payment_intent).maybeSingle();
      transaction = data;
      if (!transaction) {
        // Current connected-account charge events contain a PaymentIntent but
        // omit the invoice. Resolve the server-authoritative relationship in
        // Stripe, scoped to this same connected account.
        const paymentIntent = await stripe.paymentIntents.retrieve(object.payment_intent, { stripeAccount: accountId });
        const invoiceId = (paymentIntent as any).invoice;
        if (typeof invoiceId === "string") {
          const invoice = await stripe.invoices.retrieve(invoiceId, { stripeAccount: accountId });
          const subscriptionId = subscriptionIdFrom(invoice);
          if (subscriptionId) {
            const { data: mapped } = await admin.from("connect_transactions").select("*").eq("stripe_account_id", accountId).eq("stripe_subscription_id", subscriptionId).maybeSingle();
            transaction = mapped;
          }
        }
      }
    }
    if (!transaction) {
      await admin.from("connect_webhook_events").update({ processing_result: "stale", detail: { message: "unmapped event" } }).eq("event_id", event.id);
      return reply({ received: true, ignored: true });
    }
    let status: string | null = null; let validUntil: string | null = null;
    if (event.type === "invoice.paid") { status = "active"; validUntil = object.lines?.data?.[0]?.period?.end ? new Date(object.lines.data[0].period.end * 1000).toISOString() : null; }
    if (event.type === "invoice.payment_failed") status = "past_due";
    if (event.type === "customer.subscription.updated") { status = object.cancel_at_period_end ? "canceling" : (object.status === "active" || object.status === "trialing" ? "active" : object.status === "past_due" ? "past_due" : null); validUntil = periodEnd(object); }
    if (event.type === "customer.subscription.deleted") { status = "expired"; validUntil = periodEnd(object); }
    if (event.type === "charge.refunded" && object.refunded) status = "refunded";
    if (event.type === "charge.dispute.created") status = "disputed";
    if (event.type === "charge.dispute.closed" && object.status === "won") status = "active";
    if (!status) {
      await admin.from("connect_webhook_events").update({ processing_result: "applied", detail: { status: "pending" } }).eq("event_id", event.id);
      return reply({ received: true, ignored: true });
    }
    // Transaction settlement vocabulary is intentionally distinct from access
    // vocabulary: a paid transaction grants an active entitlement.
    const transactionStatus = status === "active" ? "paid" : status;
    const { error: transactionError } = await admin
      .from("connect_transactions")
      .update({ status: transactionStatus, stripe_invoice_id: object.object === "invoice" ? object.id : transaction.stripe_invoice_id, stripe_payment_intent_id: object.payment_intent || transaction.stripe_payment_intent_id, stripe_event_created_at: new Date(event.created * 1000).toISOString(), updated_at: new Date().toISOString() })
      .eq("id", transaction.id);
    if (transactionError) throw transactionError;
    const entitlement = { user_id: transaction.user_id, client_id: transaction.client_id, product_id: transaction.product_id, transaction_id: transaction.id, status, valid_from: status === "active" ? new Date().toISOString() : null, valid_until: validUntil, revoked_at: ["refunded", "expired", "disputed"].includes(status) ? new Date().toISOString() : null, updated_at: new Date().toISOString() };
    const { data: saved, error } = await admin.from("connect_entitlements").upsert(entitlement, { onConflict: "user_id,client_id,product_id" }).select("id").single();
    if (error) throw error;
    const { data: existingEntitlementEvent, error: entitlementEventLookupError } = await admin
      .from("connect_entitlement_events")
      .select("id")
      .eq("entitlement_id", saved.id)
      .contains("detail", { stripe_event_id: event.id })
      .maybeSingle();
    if (entitlementEventLookupError) throw entitlementEventLookupError;
    if (!existingEntitlementEvent) {
      const { error: entitlementEventError } = await admin
        .from("connect_entitlement_events")
        .insert({ entitlement_id: saved.id, event_type: event.type, detail: { status, stripe_event_id: event.id } });
      if (entitlementEventError) throw entitlementEventError;
    }
    await admin.from("connect_webhook_events").update({ processing_result: "applied", detail: { status } }).eq("event_id", event.id);
    return reply({ received: true });
  } catch (error) {
    console.error("connect-payment-webhook", error);
    await admin.from("connect_webhook_events").update({ processing_result: "failed", detail: { message: error instanceof Error ? error.message : "processing failed" } }).eq("event_id", event.id);
    return reply({ error: "processing_failed" }, 500);
  }
});
