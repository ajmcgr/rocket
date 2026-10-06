import Stripe from "npm:stripe@16.12.0";
import { getAdmin, getConnectToken, getRocketUser } from "../_shared/rocketConnect.ts";
import { retrieveStripeConnectV2Merchant, stripeConnectV2Ready } from "../_shared/stripeConnectV2.ts";
import { liveWebhookConfigured } from "../_shared/connectLiveConfiguration.ts";
import { LAUNCH_APP_ID, LAUNCH_CLIENT_ID, LAUNCH_ACCESS_URL, acceptancePlan, pilotBuyer, paidAcceptanceProof } from "../_shared/launchAcceptance.ts";

const key = Deno.env.get("STRIPE_SECRET_KEY");
const stripe = key?.startsWith("sk_live_") ? new Stripe(key, { apiVersion: "2024-06-20" }) : null;
const buyer = () => Deno.env.get("LAUNCH_ACCEPTANCE_BUYER_USER_ID");
const planId = () => Deno.env.get("LAUNCH_ACCEPTANCE_PLAN_ID");
function reply(req: Request, value: unknown, status = 200) {
  const origin = req.headers.get("origin") || "https://tryrocket.ai";
  return new Response(status === 204 ? null : JSON.stringify(value), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "Access-Control-Allow-Origin": ["https://tryrocket.ai", "https://trylaunch.ai"].includes(origin) ? origin : "https://tryrocket.ai", "Access-Control-Allow-Headers": "authorization,apikey,content-type,x-client-info,x-rocket-id-token", "Access-Control-Allow-Methods": "POST,OPTIONS", Vary: "Origin" } });
}
async function context() {
  if (!stripe || !buyer() || !planId() || !liveWebhookConfigured(Deno.env.get("STRIPE_CONNECT_LIVE_WEBHOOK_SECRET"), Deno.env.get("STRIPE_WEBHOOK_SECRET"))) return null;
  const admin = getAdmin();
  const { data: client, error: ce } = await admin.from("rocket_oauth_clients").select("client_id,app_id,created_by,environment,is_active,allowed_scopes,redirect_uris").eq("client_id", LAUNCH_CLIENT_ID).single();
  if (ce || client?.app_id !== LAUNCH_APP_ID || client.environment !== "production" || !client.is_active || !client.allowed_scopes.includes("entitlements:read") || !client.redirect_uris.includes("https://trylaunch.ai/rocket/callback")) return null;
  const { data: permitted, error: oe } = await admin.rpc("can_monetize_rocket_app", { p_user_id: client.created_by, p_app_id: LAUNCH_APP_ID });
  if (oe || !permitted) return null;
  const { data: configuration, error: ge } = await admin.from("rocket_buy_configuration").select("platform_fee_bps,live_checkout_enabled").eq("singleton", true).single();
  if (ge || configuration.platform_fee_bps !== 500) return null;
  const { data: account, error: ae } = await admin.from("connect_developer_accounts").select("*").eq("client_id", LAUNCH_CLIENT_ID).eq("developer_user_id", client.created_by).eq("is_current", true).single();
  if (ae || account.stripe_api_version !== "v2" || account.status !== "active" || !account.charges_enabled || !account.payouts_enabled) return null;
  if (!stripeConnectV2Ready(await retrieveStripeConnectV2Merchant(account.stripe_account_id, "production"))) return null;
  const { data: plan, error: pe } = await admin.from("connect_products").select("*").eq("id", planId()).single();
  if (pe || !acceptancePlan(plan, planId(), account.id, client.created_by)) return null;
  return { admin, client, account, plan, configuration };
}

Deno.serve(async req => {
  if (req.method === "OPTIONS") return reply(req, null, 204);
  if (req.method !== "POST") return reply(req, { error: "method_not_allowed" }, 405);
  const origin = req.headers.get("origin");
  if (origin && !["https://tryrocket.ai", "https://trylaunch.ai"].includes(origin)) return reply(req, { error: "origin_not_allowed" }, 403);
  try {
    const body = await req.json();
    if (!["status", "checkout", "proof"].includes(body.action)) return reply(req, { error: "invalid_action" }, 400);
    // No account creation, no public catalog changes. Disabled unless explicitly enabled for the selected buyer and new plan.
    if (body.action !== "proof" && Deno.env.get("LAUNCH_ACCEPTANCE_ENABLED") !== "true") return reply(req, { available: false }, body.action === "status" ? 200 : 409);
    const ctx = await context();
    if (!ctx) return reply(req, { error: "acceptance_not_ready" }, 409);
    const { admin, client, account, plan, configuration } = ctx;
    if (body.action === "proof") {
      const token = await getConnectToken(req);
      if (!token || token.client_id !== LAUNCH_CLIENT_ID || !token.scopes.includes("entitlements:read") || !pilotBuyer(token.user_id, client.created_by, buyer())) return reply(req, { error: "unauthorized" }, 401);
      const { data: transaction, error: te } = await admin.from("connect_transactions").select("*").eq("user_id", token.user_id).eq("client_id", LAUNCH_CLIENT_ID).eq("product_id", plan.id).eq("stripe_account_id", account.stripe_account_id).single();
      const { data: entitlement, error: ee } = await admin.from("connect_entitlements").select("*").eq("user_id", token.user_id).eq("client_id", LAUNCH_CLIENT_ID).eq("product_id", plan.id).single();
      if (te || ee || !paidAcceptanceProof(transaction, entitlement, token.user_id, plan, account.stripe_account_id)) return reply(req, { error: "new_paid_purchase_required" }, 409);
      const invoice = await stripe!.invoices.retrieve(transaction.stripe_invoice_id, { stripeAccount: account.stripe_account_id });
      if (!invoice.livemode || invoice.status !== "paid" || invoice.amount_paid !== 100 || invoice.currency !== "usd" || invoice.subscription !== transaction.stripe_subscription_id || invoice.customer !== transaction.stripe_customer_id) return reply(req, { error: "paid_invoice_mismatch" }, 409);
      const idToken = req.headers.get("x-rocket-id-token");
      if (!idToken || idToken.length > 8192) return reply(req, { error: "identity_required" }, 401);
      const external = await fetch(LAUNCH_ACCESS_URL, { method: "POST", headers: { "Content-Type": "application/json", Authorization: req.headers.get("authorization")!, "X-Rocket-ID-Token": idToken }, body: JSON.stringify({ action: "protected" }), signal: AbortSignal.timeout(10000) });
      const externalBody = await external.json();
      if (!external.ok || externalBody.message !== "Your new Buy with Rocket purchase unlocks this Launch acceptance area.") return reply(req, { error: "external_entitlement_test_failed" }, 409);
      // Keep evidence without persisting tokens or profiles. Never synthesize a paid entitlement.
      if (!plan.integration_confirmed_at) {
        const checkedAt = new Date().toISOString();
        const { error: auditError } = await admin.from("connect_entitlement_events").insert({ entitlement_id: entitlement.id, event_type: "launch_acceptance_verified", detail: { buyer_user_id: token.user_id, client_id: LAUNCH_CLIENT_ID, product_id: plan.id, transaction_id: transaction.id, stripe_invoice_id: invoice.id, external_endpoint: LAUNCH_ACCESS_URL, checked_at: checkedAt } });
        if (auditError) throw auditError;
        const { error: saveError } = await admin.from("connect_products").update({ integration_confirmed_at: checkedAt, updated_at: checkedAt }).eq("id", plan.id).eq("client_id", LAUNCH_CLIENT_ID).is("integration_confirmed_at", null);
        if (saveError) throw saveError;
      }
      return reply(req, { verified: true });
    }
    const user = await getRocketUser(req);
    if (!user || !pilotBuyer(user.id, client.created_by, buyer())) return reply(req, { error: "unauthorized" }, 401);
    // A pilot cannot replace a public offer or reuse any previous Launch purchase.
    if (configuration.live_checkout_enabled || plan.is_active || plan.integration_confirmed_at) return reply(req, { error: "acceptance_closed" }, 409);
    const [{ count: purchases, error: tError }, { count: grants, error: eError }] = await Promise.all([
      admin.from("connect_transactions").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("client_id", LAUNCH_CLIENT_ID),
      admin.from("connect_entitlements").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("client_id", LAUNCH_CLIENT_ID),
    ]);
    if (tError || eError) throw tError || eError;
    if (purchases || grants) return reply(req, { error: "new_buyer_required" }, 409);
    const price = await stripe!.prices.retrieve(plan.stripe_price_id, { stripeAccount: account.stripe_account_id });
    if (!price.livemode || !price.active || price.unit_amount !== 100 || price.currency !== "usd" || price.recurring?.interval !== "month" || price.product !== plan.stripe_product_id) return reply(req, { error: "price_mismatch" }, 409);
    if (body.action === "status") return reply(req, { available: true, plan: { id: plan.id, name: plan.name, amount_cents: 100, currency: "usd", interval: "month" } });
    if (body.confirm_purchase_terms !== "1 USD per month until canceled" || body.amount_limit_cents !== 100) return reply(req, { error: "purchase_terms_required" }, 400);
    const idempotencyKey = `launch-acceptance-${user.id}-${plan.id}`;
    const customer = await stripe!.customers.create({ metadata: { rocket_user_id: user.id, rocket_client_id: LAUNCH_CLIENT_ID } }, { stripeAccount: account.stripe_account_id, idempotencyKey: `${idempotencyKey}-customer` });
    const metadata = { rocket_user_id: user.id, rocket_client_id: LAUNCH_CLIENT_ID, rocket_product_id: plan.id };
    const session = await stripe!.checkout.sessions.create({ mode: "subscription", customer: customer.id, payment_method_types: ["card"], line_items: [{ price: plan.stripe_price_id, quantity: 1 }], success_url: "https://trylaunch.ai/rocket/acceptance", cancel_url: "https://trylaunch.ai/rocket/acceptance", subscription_data: { application_fee_percent: 5, metadata }, metadata }, { stripeAccount: account.stripe_account_id, idempotencyKey });
    if (!session.url || !session.livemode || session.amount_total !== 100 || session.currency !== "usd") {
      if (session.id && session.status === "open") await stripe!.checkout.sessions.expire(session.id, { stripeAccount: account.stripe_account_id });
      return reply(req, { error: "checkout_total_mismatch" }, 409);
    }
    const { error: customerError } = await admin.from("connect_customers").upsert({ user_id: user.id, developer_account_id: account.id, stripe_customer_id: customer.id }, { onConflict: "user_id,developer_account_id" });
    if (customerError) throw customerError;
    const { error: attemptError } = await admin.from("connect_checkout_attempts").upsert({ user_id: user.id, client_id: LAUNCH_CLIENT_ID, product_id: plan.id, stripe_account_id: account.stripe_account_id, idempotency_key: idempotencyKey, stripe_checkout_session_id: session.id, expires_at: new Date(session.expires_at * 1000).toISOString() }, { onConflict: "idempotency_key" });
    if (attemptError) throw attemptError;
    return reply(req, { checkout_url: session.url });
  } catch { return reply(req, { error: "acceptance_unavailable" }, 503); }
});
