import Stripe from "npm:stripe@16.12.0";
import { APP_URL, getAdmin, getRocketUser, json } from "../_shared/rocketConnect.ts";
import { retrieveStripeConnectV2Merchant, stripeConnectV2Ready } from "../_shared/stripeConnectV2.ts";

const key = Deno.env.get("STRIPE_SECRET_KEY");
const stripe = key?.startsWith("sk_live_") ? new Stripe(key, { apiVersion: "2024-06-20" }) : null;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const text = (value: unknown, max: number) => typeof value === "string" && value.length > 0 && value.length <= max ? value : null;

async function offer(appId: string) {
  const admin = getAdmin();
  const { data: configuration, error: configError } = await admin.from("rocket_buy_configuration")
    .select("platform_fee_bps,live_checkout_enabled").eq("singleton", true).single();
  if (configError) throw configError;
  if (!stripe || !configuration.live_checkout_enabled || !Deno.env.get("STRIPE_CONNECT_LIVE_WEBHOOK_SECRET")) return null;
  const { data: client, error: clientError } = await admin.from("rocket_oauth_clients")
    .select("client_id,app_id,created_by,is_active,allowed_scopes")
    .eq("app_id", appId).eq("environment", "production").eq("is_active", true).maybeSingle();
  if (clientError) throw clientError;
  if (!client?.created_by || !client.allowed_scopes.includes("entitlements:read")) return null;
  const { data: permitted, error: ownerError } = await admin.rpc("can_monetize_rocket_app", { p_user_id: client.created_by, p_app_id: appId });
  if (ownerError) throw ownerError;
  if (!permitted) return null;
  const { data: account, error: accountError } = await admin.from("connect_developer_accounts")
    .select("id,stripe_account_id,status,charges_enabled,payouts_enabled,stripe_api_version")
    .eq("client_id", client.client_id).eq("developer_user_id", client.created_by).eq("is_current", true).maybeSingle();
  if (accountError) throw accountError;
  if (!account || account.stripe_api_version !== "v2" || account.status !== "active" || !account.charges_enabled || !account.payouts_enabled) return null;
  const merchant = await retrieveStripeConnectV2Merchant(account.stripe_account_id, "production");
  if (!stripeConnectV2Ready(merchant)) return null;
  const { data: products, error: productError } = await admin.from("connect_products")
    .select("id,client_id,developer_account_id,developer_user_id,product_key,name,amount_cents,currency,interval,platform_fee_bps,stripe_product_id,stripe_price_id,is_active,activated_at,integration_confirmed_at")
    .eq("client_id", client.client_id).eq("developer_account_id", account.id).eq("developer_user_id", client.created_by)
    .eq("is_active", true).not("activated_at", "is", null).not("integration_confirmed_at", "is", null).limit(2);
  if (productError) throw productError;
  if (!products || products.length !== 1 || products[0].platform_fee_bps !== configuration.platform_fee_bps) return null;
  return { admin, client, account, product: products[0] };
}

const publicPlan = (product: { id: string; name: string; amount_cents: number; currency: string; interval: string }) =>
  ({ id: product.id, name: product.name, amount_cents: product.amount_cents, currency: product.currency, interval: product.interval });

async function existingPurchase(admin: ReturnType<typeof getAdmin>, userId: string, appId: string) {
  const { data: client, error: clientError } = await admin.from("rocket_oauth_clients")
    .select("client_id").eq("app_id", appId).eq("environment", "production").maybeSingle();
  if (clientError) throw clientError;
  if (!client) return null;
  const { data: entitlements, error: entitlementError } = await admin.from("connect_entitlements")
    .select("status,valid_until,product_id,updated_at").eq("user_id", userId).eq("client_id", client.client_id)
    .order("updated_at", { ascending: false }).limit(20);
  if (entitlementError) throw entitlementError;
  const entitlement = (entitlements || []).find((entry) => ["active", "canceling"].includes(entry.status) && (!entry.valid_until || new Date(entry.valid_until).getTime() > Date.now())) || entitlements?.[0];
  if (!entitlement) return null;
  const { data: product, error: productError } = await admin.from("connect_products")
    .select("id,name,amount_cents,currency,interval").eq("id", entitlement.product_id).eq("client_id", client.client_id).maybeSingle();
  if (productError) throw productError;
  return product ? { client, product, entitlement,
    active: ["active", "canceling"].includes(entitlement.status) && (!entitlement.valid_until || new Date(entitlement.valid_until).getTime() > Date.now()) } : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: { "Access-Control-Allow-Origin": APP_URL, "Access-Control-Allow-Headers": "authorization,apikey,content-type,x-client-info", "Access-Control-Allow-Methods": "POST,OPTIONS", Vary: "Origin" } });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    const action = text(body.action, 20);
    const admin = getAdmin();

    if (action === "library") {
      const user = await getRocketUser(req);
      if (!user) return json({ error: "unauthorized" }, 401);
      const { data: entitlements, error } = await admin.from("connect_entitlements")
        .select("id,user_id,client_id,product_id,status,valid_until,updated_at")
        .eq("user_id", user.id).order("updated_at", { ascending: false });
      if (error) throw error;
      if (!entitlements?.length) return json({ purchases: [] });
      const clientIds = [...new Set(entitlements.map((entry) => entry.client_id))];
      const productIds = [...new Set(entitlements.map((entry) => entry.product_id))];
      const [{ data: clients, error: clientsError }, { data: products, error: productsError }] = await Promise.all([
        admin.from("rocket_oauth_clients").select("client_id,app_id,name,environment").in("client_id", clientIds).eq("environment", "production"),
        admin.from("connect_products").select("id,name,amount_cents,currency,interval").in("id", productIds),
      ]);
      if (clientsError || productsError) throw clientsError || productsError;
      const appIds = (clients || []).map((client) => client.app_id).filter(Boolean);
      const { data: apps, error: appsError } = appIds.length
        ? await admin.from("public_apps").select("id,name,website_url").in("id", appIds)
        : { data: [], error: null };
      if (appsError) throw appsError;
      const clientMap = new Map((clients || []).map((client) => [client.client_id, client]));
      const productMap = new Map((products || []).map((product) => [product.id, product]));
      const appMap = new Map((apps || []).map((app) => [app.id, app]));
      return json({ purchases: entitlements.flatMap((entry) => {
        const client = clientMap.get(entry.client_id); const product = productMap.get(entry.product_id);
        const app = client?.app_id ? appMap.get(client.app_id) : null;
        return app && product ? [{ app_id: app.id, app_name: app.name, website_url: app.website_url, plan: publicPlan(product), status: entry.status, valid_until: entry.valid_until,
          active: ["active", "canceling"].includes(entry.status) && (!entry.valid_until || new Date(entry.valid_until).getTime() > Date.now()) }] : [];
      }) });
    }

    const appId = text(body.app_id, 36);
    if (!appId || !uuid.test(appId)) return json({ error: "invalid_app" }, 400);
    if (action === "catalog") {
      const available = await offer(appId);
      return json({ plan: available ? publicPlan(available.product) : null });
    }
    const user = await getRocketUser(req);
    if (!user) return json({ error: "unauthorized" }, 401);
    if (action === "status" || action === "cancel") {
      const purchase = await existingPurchase(admin, user.id, appId);
      if (action === "status") {
        const available = purchase ? null : await offer(appId);
        return json({ plan: purchase ? publicPlan(purchase.product) : available ? publicPlan(available.product) : null,
          entitlement: purchase ? { status: purchase.entitlement.status, valid_until: purchase.entitlement.valid_until, active: purchase.active } : null });
      }
      if (!stripe || !purchase?.active) return json({ error: "active_purchase_required" }, 409);
      const { data: transaction, error } = await admin.from("connect_transactions")
        .select("id,stripe_subscription_id,stripe_account_id,developer_account_id")
        .eq("user_id", user.id).eq("client_id", purchase.client.client_id).eq("product_id", purchase.product.id)
        .in("status", ["paid", "canceling"]).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      if (!transaction?.stripe_subscription_id) return json({ error: "subscription_not_found" }, 404);
      const { data: account, error: accountError } = await admin.from("connect_developer_accounts")
        .select("id,stripe_account_id").eq("id", transaction.developer_account_id)
        .eq("client_id", purchase.client.client_id).eq("stripe_account_id", transaction.stripe_account_id).maybeSingle();
      if (accountError) throw accountError;
      if (!account) return json({ error: "merchant_account_mismatch" }, 409);
      const subscription = await stripe.subscriptions.retrieve(transaction.stripe_subscription_id, { stripeAccount: account.stripe_account_id });
      if (subscription.metadata.rocket_user_id !== user.id || subscription.metadata.rocket_client_id !== purchase.client.client_id || subscription.metadata.rocket_product_id !== purchase.product.id) return json({ error: "subscription_mismatch" }, 409);
      if (!subscription.cancel_at_period_end) await stripe.subscriptions.update(subscription.id, { cancel_at_period_end: true }, { stripeAccount: account.stripe_account_id, idempotencyKey: `rocket-buy-cancel-${subscription.id}` });
      return json({ cancellation_requested: true, active_until: new Date(subscription.current_period_end * 1000).toISOString() });
    }
    const available = await offer(appId);
    if (!available) return json({ error: "buy_unavailable" }, 409);
    const { client, account, product } = available;
    const { data: entitlement, error: entitlementError } = await admin.from("connect_entitlements")
      .select("status,valid_until").eq("user_id", user.id).eq("client_id", client.client_id).eq("product_id", product.id).maybeSingle();
    if (entitlementError) throw entitlementError;
    const hasAccess = !!entitlement && ["active", "canceling"].includes(entitlement.status) && (!entitlement.valid_until || new Date(entitlement.valid_until).getTime() > Date.now());
    if (action === "checkout") {
      if (user.id === client.created_by) return json({ error: "cannot_buy_own_app" }, 403);
      if (hasAccess) return json({ error: "already_purchased" }, 409);
      if (!stripe) return json({ error: "buy_unavailable" }, 503);
      const { data: previousTransactions, error: previousError } = await admin.from("connect_transactions")
        .select("stripe_subscription_id").eq("user_id", user.id).eq("client_id", client.client_id)
        .eq("product_id", product.id).eq("stripe_account_id", account.stripe_account_id)
        .not("stripe_subscription_id", "is", null).order("created_at", { ascending: false }).limit(3);
      if (previousError) throw previousError;
      for (const previous of previousTransactions || []) {
        const subscription = await stripe.subscriptions.retrieve(previous.stripe_subscription_id, { stripeAccount: account.stripe_account_id });
        if (!["canceled", "incomplete_expired"].includes(subscription.status)) return json({ error: "existing_subscription_needs_attention" }, 409);
      }
      const price = await stripe.prices.retrieve(product.stripe_price_id, { stripeAccount: account.stripe_account_id });
      if (!price.active || price.unit_amount !== product.amount_cents || price.currency !== product.currency || price.recurring?.interval !== product.interval || price.product !== product.stripe_product_id) return json({ error: "plan_not_ready" }, 409);
      const { data: existing } = await admin.from("connect_checkout_attempts").select("stripe_checkout_session_id")
        .eq("user_id", user.id).eq("client_id", client.client_id).eq("product_id", product.id)
        .eq("stripe_account_id", account.stripe_account_id).gt("expires_at", new Date().toISOString())
        .not("stripe_checkout_session_id", "is", null).limit(1);
      if (existing?.[0]?.stripe_checkout_session_id) {
        const previous = await stripe.checkout.sessions.retrieve(existing[0].stripe_checkout_session_id, { stripeAccount: account.stripe_account_id });
        if (previous.status === "open" && previous.url) return json({ checkout_url: previous.url, reused: true });
      }
      const { data: customerRow } = await admin.from("connect_customers").select("stripe_customer_id")
        .eq("user_id", user.id).eq("developer_account_id", account.id).maybeSingle();
      let customerId = customerRow?.stripe_customer_id;
      if (!customerId) {
        const customer = await stripe.customers.create({ email: user.email || undefined, metadata: { rocket_user_id: user.id, rocket_client_id: client.client_id } }, { stripeAccount: account.stripe_account_id });
        customerId = customer.id;
        const { error } = await admin.from("connect_customers").upsert({ user_id: user.id, developer_account_id: account.id, stripe_customer_id: customerId }, { onConflict: "user_id,developer_account_id" });
        if (error) throw error;
      }
      const now = Date.now();
      const idempotencyKey = `rocket-buy-production-${user.id}-${client.client_id}-${product.id}-${Math.floor(now / 1800000)}`;
      const returnUrl = `${APP_URL}/apps/${appId}`;
      const session = await stripe.checkout.sessions.create({
        mode: "subscription", customer: customerId, payment_method_types: ["card"], line_items: [{ price: product.stripe_price_id, quantity: 1 }],
        success_url: `${returnUrl}?purchase=processing`, cancel_url: `${returnUrl}?purchase=cancelled`,
        subscription_data: { application_fee_percent: product.platform_fee_bps / 100, metadata: { rocket_user_id: user.id, rocket_client_id: client.client_id, rocket_product_id: product.id } },
        metadata: { rocket_user_id: user.id, rocket_client_id: client.client_id, rocket_product_id: product.id },
      }, { stripeAccount: account.stripe_account_id, idempotencyKey });
      if (!session.url) return json({ error: "checkout_unavailable" }, 503);
      const { error } = await admin.from("connect_checkout_attempts").upsert({ user_id: user.id, client_id: client.client_id, product_id: product.id, stripe_account_id: account.stripe_account_id,
        idempotency_key: idempotencyKey, stripe_checkout_session_id: session.id, expires_at: new Date(now + 30 * 60_000).toISOString() }, { onConflict: "idempotency_key" });
      if (error) throw error;
      return json({ checkout_url: session.url, reused: false });
    }
    return json({ error: "invalid_action" }, 400);
  } catch (error) {
    console.error("rocket-buy", error);
    return json({ error: "buy_unavailable" }, 500);
  }
});
