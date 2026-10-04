import Stripe from "npm:stripe@16.12.0";
import { base64url, CORS_HEADERS, getAdmin, getConnectToken, json } from "../_shared/rocketConnect.ts";
import { retrieveStripeConnectV2Merchant, stripeConnectV2Ready } from "../_shared/stripeConnectV2.ts";

const stripeKey = Deno.env.get("STRIPE_CONNECT_TEST_SECRET_KEY");
const stripe = stripeKey?.startsWith("sk_test_") ? new Stripe(stripeKey, { apiVersion: "2024-06-20" }) : null;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const token = await getConnectToken(req);
  if (!token) return json({ error: "invalid_token" }, 401, { "WWW-Authenticate": "Bearer" });
  if (!stripe) return json({ error: "connect_test_mode_not_configured" }, 503);
  try {
    const body = await req.json();
    if (typeof body.product_key !== "string") return json({ error: "invalid_request" }, 400);
    const admin = getAdmin();
    const { data: product } = await admin.from("connect_products")
      .select("*, connect_developer_accounts!inner(id,client_id,stripe_account_id,status,charges_enabled,payouts_enabled,is_current,stripe_api_version)")
      .eq("client_id", token.client_id).eq("product_key", body.product_key).eq("is_active", true).maybeSingle();
    const developer = (product as any)?.connect_developer_accounts;
    const { data: client } = await admin.from("rocket_oauth_clients").select("environment").eq("client_id", token.client_id).maybeSingle();
    if (client?.environment !== "test") return json({ error: "test_client_required" }, 403);
    if (!product || !developer || developer.client_id !== token.client_id || !developer.is_current || developer.status !== "active" || !developer.charges_enabled || !developer.payouts_enabled) return json({ error: "product_unavailable" }, 403);
    if (body.action === "reconcile") {
      if (!token.scopes.includes("entitlements:read")) return json({ error: "insufficient_scope" }, 403);
      if (typeof body.checkout_session_id !== "string") return json({ error: "invalid_request" }, 400);
      const { data: attempt } = await admin.from("connect_checkout_attempts").select("*")
        .eq("user_id", token.user_id).eq("client_id", token.client_id).eq("product_id", product.id)
        .eq("stripe_account_id", developer.stripe_account_id).eq("stripe_checkout_session_id", body.checkout_session_id).maybeSingle();
      if (!attempt?.stripe_checkout_session_id) return json({ error: "checkout_not_found" }, 404);
      const { data: pendingTransaction, error: pendingError } = await admin.from("connect_transactions").select("id,status,user_id,client_id,product_id,developer_account_id,stripe_account_id,stripe_subscription_id")
        .eq("stripe_checkout_session_id", attempt.stripe_checkout_session_id).maybeSingle();
      if (pendingError) throw pendingError;
      if (!pendingTransaction || pendingTransaction.status !== "pending" || pendingTransaction.user_id !== token.user_id || pendingTransaction.client_id !== token.client_id || pendingTransaction.product_id !== product.id || pendingTransaction.developer_account_id !== developer.id || pendingTransaction.stripe_account_id !== developer.stripe_account_id) return json({ error: "not_pending" }, 409);
      const { data: existingEntitlement, error: existingEntitlementError } = await admin.from("connect_entitlements").select("id")
        .eq("user_id", token.user_id).eq("client_id", token.client_id).eq("product_id", product.id).maybeSingle();
      if (existingEntitlementError) throw existingEntitlementError;
      if (existingEntitlement) return json({ error: "entitlement_already_exists" }, 409);
      const checkout = await stripe.checkout.sessions.retrieve(attempt.stripe_checkout_session_id, { stripeAccount: developer.stripe_account_id });
      if (checkout.status !== "complete" || checkout.payment_status !== "paid" || checkout.mode !== "subscription" || typeof checkout.subscription !== "string" || typeof checkout.invoice !== "string") return json({ error: "checkout_not_settled" }, 409);
      const invoice: any = await stripe.invoices.retrieve(checkout.invoice, { stripeAccount: developer.stripe_account_id });
      const metadata = invoice.parent?.subscription_details?.metadata || {};
      if (invoice.status !== "paid" || invoice.amount_paid !== product.amount_cents || invoice.currency !== product.currency || invoice.parent?.subscription_details?.subscription !== checkout.subscription || pendingTransaction.stripe_subscription_id !== checkout.subscription || metadata.rocket_user_id !== token.user_id || metadata.rocket_client_id !== token.client_id || metadata.rocket_product_id !== product.id) return json({ error: "invoice_not_authoritative" }, 409);
      const { data: transaction, error: transactionError } = await admin.from("connect_transactions").update({ stripe_customer_id: typeof checkout.customer === "string" ? checkout.customer : null, stripe_invoice_id: invoice.id, status: "paid", stripe_event_created_at: new Date(invoice.created * 1000).toISOString(), updated_at: new Date().toISOString() })
        .eq("id", pendingTransaction.id).eq("status", "pending").select().maybeSingle();
      if (transactionError) throw transactionError;
      if (!transaction) return json({ error: "transaction_changed" }, 409);
      const validUntil = invoice.lines?.data?.[0]?.period?.end ? new Date(invoice.lines.data[0].period.end * 1000).toISOString() : null;
      const { data: entitlement, error: entitlementError } = await admin.from("connect_entitlements").upsert({ user_id: token.user_id, client_id: token.client_id, product_id: product.id, transaction_id: transaction.id, status: "active", valid_from: new Date().toISOString(), valid_until: validUntil, revoked_at: null, updated_at: new Date().toISOString() }, { onConflict: "user_id,client_id,product_id" }).select("id").single();
      if (entitlementError) throw entitlementError;
      const detail = { checkout_session_id: checkout.id, stripe_invoice_id: invoice.id, reason: "verified_delivery_ordering_recovery" };
      const { data: existing, error: lookupError } = await admin.from("connect_entitlement_events").select("id").eq("entitlement_id", entitlement.id).eq("event_type", "reconciliation.invoice.paid").contains("detail", { stripe_invoice_id: invoice.id }).maybeSingle();
      if (lookupError) throw lookupError;
      if (!existing) { const { error } = await admin.from("connect_entitlement_events").insert({ entitlement_id: entitlement.id, event_type: "reconciliation.invoice.paid", detail }); if (error) throw error; }
      return json({ reconciled: true });
    }
    if (typeof body.return_uri !== "string") return json({ error: "invalid_request" }, 400);
    if (!product.checkout_return_uris.includes(body.return_uri)) return json({ error: "invalid_return_uri" }, 400);
    // Verify the real test-mode account and immutable registered price before
    // creating a customer or session. Browser-provided amounts are never read.
    const accountReady = developer.stripe_api_version === "v2"
      ? stripeConnectV2Ready(await retrieveStripeConnectV2Merchant(developer.stripe_account_id))
      : (() => false)();
    const account = developer.stripe_api_version === "v2" ? null : await stripe.accounts.retrieve(developer.stripe_account_id);
    const price = await stripe.prices.retrieve(product.stripe_price_id, { stripeAccount: developer.stripe_account_id });
    if ((developer.stripe_api_version === "v2" ? !accountReady : !account?.charges_enabled || !account?.payouts_enabled) || price.livemode || !price.active || price.unit_amount !== product.amount_cents || price.currency !== product.currency || price.recurring?.interval !== product.interval || price.product !== product.stripe_product_id) return json({ error: "stripe_configuration_invalid" }, 503);
    const now = Date.now();
    const { data: existing } = await admin.from("connect_checkout_attempts").select("stripe_checkout_session_id,expires_at")
      .eq("user_id", token.user_id).eq("client_id", token.client_id).eq("product_id", product.id).gt("expires_at", new Date(now).toISOString()).not("stripe_checkout_session_id", "is", null).maybeSingle();
    if (existing?.stripe_checkout_session_id) {
      const session = await stripe.checkout.sessions.retrieve(existing.stripe_checkout_session_id, { stripeAccount: developer.stripe_account_id });
      if (session.url) return json({ checkout_url: session.url, reused: true });
    }
    const { data: customerRow } = await admin.from("connect_customers").select("stripe_customer_id").eq("user_id", token.user_id).eq("developer_account_id", developer.id).maybeSingle();
    let customerId = customerRow?.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({ metadata: { rocket_user_id: token.user_id, rocket_client_id: token.client_id } }, { stripeAccount: developer.stripe_account_id });
      customerId = customer.id;
      const { error } = await admin.from("connect_customers").upsert({ user_id: token.user_id, developer_account_id: developer.id, stripe_customer_id: customerId }, { onConflict: "user_id,developer_account_id" });
      if (error) throw error;
    }
    const idempotencyKey = `rocket-connect-test-${token.user_id}-${token.client_id}-${product.id}-${Math.floor(now / 1800000)}`;
    const session = await stripe.checkout.sessions.create({
      mode: "subscription", customer: customerId,
      line_items: [{ price: product.stripe_price_id, quantity: 1 }],
      success_url: `${body.return_uri}?checkout=success`, cancel_url: `${body.return_uri}?checkout=cancelled`,
      subscription_data: { application_fee_percent: product.platform_fee_bps / 100, metadata: { rocket_user_id: token.user_id, rocket_client_id: token.client_id, rocket_product_id: product.id } },
      metadata: { rocket_user_id: token.user_id, rocket_client_id: token.client_id, rocket_product_id: product.id },
    }, { stripeAccount: developer.stripe_account_id, idempotencyKey });
    const { error } = await admin.from("connect_checkout_attempts").upsert({ user_id: token.user_id, client_id: token.client_id, product_id: product.id, stripe_account_id: developer.stripe_account_id, idempotency_key: idempotencyKey, stripe_checkout_session_id: session.id, expires_at: new Date(now + 30 * 60_000).toISOString() }, { onConflict: "idempotency_key" });
    if (error) throw error;
    return json({ checkout_url: session.url, reused: false });
  } catch (error) { console.error("connect-payment-checkout", error); return json({ error: "checkout_unavailable" }, 500); }
});
