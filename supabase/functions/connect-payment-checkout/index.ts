import Stripe from "npm:stripe@16.12.0";
import { base64url, CORS_HEADERS, getAdmin, getConnectToken, json } from "../_shared/rocketConnect.ts";

const stripeKey = Deno.env.get("STRIPE_CONNECT_TEST_SECRET_KEY");
const stripe = stripeKey?.startsWith("sk_test_") ? new Stripe(stripeKey, { apiVersion: "2024-06-20" }) : null;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!stripe) return json({ error: "connect_test_mode_not_configured" }, 503);
  const token = await getConnectToken(req);
  if (!token) return json({ error: "invalid_token" }, 401, { "WWW-Authenticate": "Bearer" });
  try {
    const body = await req.json();
    if (typeof body.product_key !== "string" || typeof body.return_uri !== "string") return json({ error: "invalid_request" }, 400);
    const admin = getAdmin();
    const { data: product } = await admin.from("connect_products")
      .select("*, connect_developer_accounts!inner(id,client_id,stripe_account_id,status,charges_enabled,payouts_enabled)")
      .eq("client_id", token.client_id).eq("product_key", body.product_key).eq("is_active", true).maybeSingle();
    const developer = (product as any)?.connect_developer_accounts;
    if (!product || !developer || developer.client_id !== token.client_id || developer.status !== "active" || !developer.charges_enabled || !developer.payouts_enabled) return json({ error: "product_unavailable" }, 403);
    if (!product.checkout_return_uris.includes(body.return_uri)) return json({ error: "invalid_return_uri" }, 400);
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
