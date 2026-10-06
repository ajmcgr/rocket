import Stripe from "npm:stripe@16.12.0";
import { getAdmin } from "../_shared/rocketConnect.ts";
import { isolatedLiveWebhookSecret } from "../_shared/connectLiveConfiguration.ts";
import { isCurrentInvoiceFullyRefunded, subscriptionAccessChange, verifiedPaidInvoicePeriodEnd, registeredApplicationFee, verifiedSubscriptionPeriodEnd } from "../_shared/connectPaymentRules.ts";

const testKey = Deno.env.get("STRIPE_CONNECT_TEST_SECRET_KEY");
const liveKey = Deno.env.get("STRIPE_SECRET_KEY");
const testSecret = Deno.env.get("STRIPE_CONNECT_TEST_WEBHOOK_SECRET");
const liveSecret = isolatedLiveWebhookSecret(Deno.env.get("STRIPE_CONNECT_LIVE_WEBHOOK_SECRET"), Deno.env.get("STRIPE_WEBHOOK_SECRET"));
const testStripe = testKey?.startsWith("sk_test_") ? new Stripe(testKey, { apiVersion: "2024-06-20" }) : null;
const liveStripe = liveKey?.startsWith("sk_live_") ? new Stripe(liveKey, { apiVersion: "2024-06-20" }) : null;
const reply = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });

function subscriptionIdFrom(object: any) {
  if (object?.object === "subscription") return typeof object.id === "string" ? object.id : null;
  if (typeof object?.subscription === "string") return object.subscription;
  const currentSubscription = object?.parent?.subscription_details?.subscription;
  return typeof currentSubscription === "string" ? currentSubscription : null;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return reply({ error: "method_not_allowed" }, 405);
  if ((!testStripe || !testSecret) && (!liveStripe || !liveSecret)) return reply({ error: "connect_webhook_not_configured" }, 503);
  const signature = req.headers.get("stripe-signature");
  if (!signature) { console.error("connect-webhook: missing Stripe signature"); return reply({ error: "missing_signature" }, 400); }
  const payload = await req.text();
  let event: Stripe.Event | null = null;
  let environment: "test" | "production" | null = null;
  let stripe: Stripe | null = null;
  for (const candidate of [{ stripe: testStripe, secret: testSecret, environment: "test" as const }, { stripe: liveStripe, secret: liveSecret, environment: "production" as const }]) {
    if (!candidate.stripe || !candidate.secret) continue;
    try { event = await candidate.stripe.webhooks.constructEventAsync(payload, signature, candidate.secret); environment = candidate.environment; stripe = candidate.stripe; break; }
    catch { /* A signature from the other isolated Connect environment may follow. */ }
  }
  if (!event || !environment || !stripe) { console.error("connect-webhook: invalid Stripe signature"); return reply({ error: "invalid_signature" }, 400); }
  // The signing secret and event mode must agree before any receipt or ledger
  // write. Account/client scoping below independently checks the same mode.
  if (event.livemode !== (environment === "production")) return reply({ error: "event_mode_mismatch" }, 400);
  const accountId = event.account;
  if (!accountId) { console.error(`connect-webhook: missing connected account context for ${event.type}`); return reply({ error: "not_connect_event" }, 400); }
  const admin = getAdmin();
  const { data: account } = await admin.from("connect_developer_accounts").select("id,client_id,stripe_account_id,status,rocket_oauth_clients!inner(environment)")
    .eq("stripe_account_id", accountId).eq("rocket_oauth_clients.environment", environment).maybeSingle();
  if (!account) { console.error(`connect-webhook: unregistered connected account ${accountId}`); return reply({ error: "unknown_connected_account" }, 400); }
  const { error: received } = await admin.from("connect_webhook_events").insert({ event_id: event.id, stripe_account_id: accountId, event_type: event.type, event_created_at: new Date(event.created * 1000).toISOString(), processing_result: "stale", detail: {} });
  const isDuplicate = received?.code === "23505";
  const { data: priorReceipt } = isDuplicate ? await admin.from("connect_webhook_events").select("processing_result,stripe_account_id")
    .eq("event_id", event.id).maybeSingle() : { data: null };
  if (isDuplicate && priorReceipt?.stripe_account_id !== accountId) return reply({ error: "event_account_mismatch" }, 400);
  // Permit recovery only for payment-settlement events that can legitimately
  // have reached the receipt ledger before their downstream state transition.
  if (isDuplicate && priorReceipt?.processing_result !== "failed" && !["invoice.paid", "charge.refunded"].includes(event.type)) return reply({ received: true, duplicate: true });
  if (received && !isDuplicate) return reply({ error: "event_record_failed" }, 500);
  try {
    const object: any = event.data.object;
    let transaction: any = null;
    // Stripe can deliver invoice.paid before checkout.session.completed. Keep
    // fulfillment webhook-authoritative by reconciling the canonical invoice
    // from the completed Checkout event once its transaction mapping exists.
    let settledInvoice: any = null;
    let resolvedInvoiceId: string | null = null;
    if (isDuplicate && event.type === "invoice.paid") {
      const subscriptionId = subscriptionIdFrom(object);
      if (!subscriptionId) return reply({ received: true, duplicate: true });
      const { data: existing } = await admin.from("connect_transactions").select("status").eq("stripe_account_id", accountId).eq("stripe_subscription_id", subscriptionId).maybeSingle();
      if (!existing || existing.status === "paid") return reply({ received: true, duplicate: true });
    }
    if (event.type === "checkout.session.completed") {
      const { data: attempt } = await admin.from("connect_checkout_attempts").select("*").eq("stripe_checkout_session_id", object.id).eq("stripe_account_id", accountId).maybeSingle();
      if (!attempt || object.mode !== "subscription") throw new Error("Unmapped checkout");
      if (object.payment_status !== "paid") {
        await admin.from("connect_webhook_events").update({ processing_result: "stale", detail: { message: "checkout payment is not settled" } }).eq("event_id", event.id);
        return reply({ received: true, ignored: true });
      }
      const { data: product } = await admin.from("connect_products").select("*").eq("id", attempt.product_id).eq("client_id", attempt.client_id).maybeSingle();
      if (!product) throw new Error("Missing registered product");
      // Retrieve the canonical Checkout object because connected-account event
      // payloads can omit payment_intent. Persisting it makes later charge
      // refunds an exact, account-scoped transaction lookup.
      const checkout = await stripe.checkout.sessions.retrieve(object.id, { stripeAccount: accountId });
      const { data: previous, error: previousError } = await admin.from("connect_transactions").select("*")
        .eq("stripe_checkout_session_id", object.id).eq("stripe_account_id", accountId).maybeSingle();
      if (previousError) throw previousError;
      if (previous && (previous.user_id !== attempt.user_id || previous.client_id !== attempt.client_id || previous.product_id !== attempt.product_id)) throw new Error("Checkout transaction mapping changed");
      if (previous) transaction = previous;
      else {
        const { data, error } = await admin.from("connect_transactions").insert({ user_id: attempt.user_id, client_id: attempt.client_id, product_id: attempt.product_id, developer_account_id: account.id, stripe_account_id: accountId, stripe_checkout_session_id: object.id, stripe_customer_id: typeof object.customer === "string" ? object.customer : null, stripe_subscription_id: typeof object.subscription === "string" ? object.subscription : null, stripe_payment_intent_id: typeof checkout.payment_intent === "string" ? checkout.payment_intent : null, amount_cents: product.amount_cents, application_fee_cents: registeredApplicationFee(product.amount_cents, product.platform_fee_bps), currency: product.currency, status: "pending", stripe_event_created_at: new Date(event.created * 1000).toISOString() }).select().single();
        if (error) throw error;
        transaction = data;
      }
      if (typeof checkout.invoice === "string") {
        const invoice = await stripe.invoices.retrieve(checkout.invoice, { stripeAccount: accountId });
        if (invoice.status === "paid") settledInvoice = invoice;
      }
    } else if (subscriptionIdFrom(object)) {
      const subscriptionId = subscriptionIdFrom(object)!;
      const { data } = await admin.from("connect_transactions").select("*").eq("stripe_account_id", accountId).eq("stripe_subscription_id", subscriptionId).maybeSingle(); transaction = data;
    } else if (typeof object.invoice === "string") {
      // Charge events do not carry the subscription ID. Resolve their invoice
      // in the same connected-account context rather than trusting metadata or
      // performing a broad customer lookup.
      const invoice = await stripe.invoices.retrieve(object.invoice, { stripeAccount: accountId });
      resolvedInvoiceId = invoice.id;
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
          resolvedInvoiceId = invoice.id;
          const subscriptionId = subscriptionIdFrom(invoice);
          if (subscriptionId) {
            const { data: mapped } = await admin.from("connect_transactions").select("*").eq("stripe_account_id", accountId).eq("stripe_subscription_id", subscriptionId).maybeSingle();
            transaction = mapped;
          }
        }
        if (!transaction) {
          // Some current API charge events expose neither invoice nor metadata.
          // Checkout's payment-intent index is still authoritative and lets us
          // bind the event to the exact recorded Checkout Session.
          const sessions = await stripe.checkout.sessions.list({ payment_intent: object.payment_intent, limit: 1 }, { stripeAccount: accountId });
          const checkoutSessionId = sessions.data[0]?.id;
          if (checkoutSessionId) {
            const { data: mapped } = await admin.from("connect_transactions").select("*").eq("stripe_account_id", accountId).eq("stripe_checkout_session_id", checkoutSessionId).maybeSingle();
            transaction = mapped;
          }
        }
        if (!transaction && typeof object.customer === "string") {
          // Older event/API combinations can omit the PaymentIntent's invoice
          // and do not populate Checkout's payment-intent index. This remains
          // safe: restrict to the same connected account and customer, then
          // require an exact PaymentIntent equality before touching Rocket data.
          const sessions = await stripe.checkout.sessions.list({ customer: object.customer, limit: 100 }, { stripeAccount: accountId });
          const matched = sessions.data.find((session) => session.payment_intent === object.payment_intent);
          if (matched) {
            const { data: mapped } = await admin.from("connect_transactions").select("*").eq("stripe_account_id", accountId).eq("stripe_checkout_session_id", matched.id).maybeSingle();
            transaction = mapped;
          }
        }
      }
    }
    if (!transaction) {
      await admin.from("connect_webhook_events").update({ processing_result: "stale", detail: { message: "unmapped event" } }).eq("event_id", event.id);
      return reply({ received: true, ignored: true });
    }
    if (transaction.stripe_event_created_at && new Date(transaction.stripe_event_created_at).getTime() > event.created * 1000 && transaction.status !== "pending") {
      await admin.from("connect_webhook_events").update({ processing_result: "stale", detail: { message: "older event" } }).eq("event_id", event.id);
      return reply({ received: true, ignored: true });
    }
    let status: string | null = null; let validUntil: string | null = null;
    const invoiceForSettlement = event.type === "invoice.paid" ? object : settledInvoice;
    let settledPeriodEnd: number | null = null;
    if (invoiceForSettlement) {
      let invoiceMetadata = invoiceForSettlement.parent?.subscription_details?.metadata || invoiceForSettlement.subscription_details?.metadata || {};
      if (!invoiceMetadata.rocket_user_id && transaction.stripe_subscription_id) {
        const subscription = await stripe.subscriptions.retrieve(transaction.stripe_subscription_id, { stripeAccount: accountId });
        invoiceMetadata = subscription.metadata;
      }
      const { data: purchasedProduct, error: purchasedProductError } = await admin.from("connect_products")
        .select("stripe_price_id").eq("id", transaction.product_id).eq("client_id", transaction.client_id).maybeSingle();
      if (purchasedProductError || !purchasedProduct) throw purchasedProductError || new Error("Missing registered price");
      settledPeriodEnd = verifiedPaidInvoicePeriodEnd(invoiceForSettlement, { currency: transaction.currency, amount_cents: transaction.amount_cents, stripe_price_id: purchasedProduct.stripe_price_id });
      if (!settledPeriodEnd ||
          subscriptionIdFrom(invoiceForSettlement) !== transaction.stripe_subscription_id ||
          invoiceMetadata.rocket_user_id !== transaction.user_id ||
          invoiceMetadata.rocket_client_id !== transaction.client_id ||
          invoiceMetadata.rocket_product_id !== transaction.product_id) throw new Error("Invoice did not match the recorded Rocket purchase");
    }
    if (invoiceForSettlement) { status = "active"; validUntil = new Date(settledPeriodEnd! * 1000).toISOString(); }
    if (event.type === "invoice.payment_failed") status = "past_due";
    if (event.type === "customer.subscription.updated") {
      status = subscriptionAccessChange(object.status, !!object.cancel_at_period_end, transaction.status);
      if (status === "active" || status === "canceling") {
        const { data: purchasedProduct, error: purchasedProductError } = await admin.from("connect_products")
          .select("stripe_price_id").eq("id", transaction.product_id).eq("client_id", transaction.client_id).maybeSingle();
        if (purchasedProductError || !purchasedProduct) throw purchasedProductError || new Error("Missing registered price");
        const end = verifiedSubscriptionPeriodEnd(object, purchasedProduct.stripe_price_id);
        if (!end) throw new Error("Subscription did not match the recorded Rocket purchase period");
        validUntil = new Date(end * 1000).toISOString();
      }
    }
    if (event.type === "customer.subscription.deleted") status = "expired";
    if (event.type === "charge.refunded" && (
      isCurrentInvoiceFullyRefunded(!!object.refunded, resolvedInvoiceId, transaction.stripe_invoice_id) ||
      (!!object.refunded && !resolvedInvoiceId && typeof object.payment_intent === "string" && object.payment_intent === transaction.stripe_payment_intent_id)
    )) status = "refunded";
    if (event.type === "charge.dispute.created") status = "disputed";
    // A won dispute does not by itself prove the subscription is still paid.
    // The next verified invoice settlement can restore access.
    if (!status) {
      await admin.from("connect_webhook_events").update({ processing_result: "applied", detail: { status: "pending" } }).eq("event_id", event.id);
      return reply({ received: true, ignored: true });
    }
    // Transaction settlement vocabulary is intentionally distinct from access
    // vocabulary: a paid transaction grants an active entitlement.
    const transactionStatus = status === "active" ? "paid" : status;
    const { error: transactionError } = await admin
      .from("connect_transactions")
      .update({ status: transactionStatus, stripe_invoice_id: invoiceForSettlement?.id || (object.object === "invoice" ? object.id : transaction.stripe_invoice_id), stripe_payment_intent_id: typeof object.payment_intent === "string" ? object.payment_intent : transaction.stripe_payment_intent_id, stripe_event_created_at: new Date(event.created * 1000).toISOString(), updated_at: new Date().toISOString() })
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
