import Stripe from "npm:stripe@16.12.0";
import {
  APP_URL,
  getAdmin,
  getRocketUser,
  getConnectToken,
  json,
} from "../_shared/rocketConnect.ts";
import { buyMerchantReadiness } from "../_shared/buyMerchant.ts";
import { billingType, priceMatches } from "../_shared/oneTimePayments.ts";
import { liveWebhookConfigured } from "../_shared/connectLiveConfiguration.ts";
import { libraryPurchases } from "../_shared/buyerLibrary.ts";

const key = Deno.env.get("STRIPE_SECRET_KEY");
const stripe = key?.startsWith("sk_live_")
  ? new Stripe(key, { apiVersion: "2024-06-20" })
  : null;
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const text = (value: unknown, max: number) =>
  typeof value === "string" && value.length > 0 && value.length <= max
    ? value
    : null;

async function offer(appId: string) {
  const admin = getAdmin();
  const { data: configuration, error: configError } = await admin
    .from("rocket_buy_configuration")
    .select("platform_fee_bps,live_checkout_enabled")
    .eq("singleton", true)
    .single();
  if (configError) throw configError;
  if (
    !stripe ||
    !configuration.live_checkout_enabled ||
    !liveWebhookConfigured(
      Deno.env.get("STRIPE_CONNECT_LIVE_WEBHOOK_SECRET"),
      Deno.env.get("STRIPE_WEBHOOK_SECRET"),
    )
  )
    return null;
  const { data: client, error: clientError } = await admin
    .from("rocket_oauth_clients")
    .select("client_id,app_id,created_by,is_active,allowed_scopes")
    .eq("app_id", appId)
    .eq("environment", "production")
    .eq("is_active", true)
    .maybeSingle();
  if (clientError) throw clientError;
  if (
    !client?.created_by ||
    !client.allowed_scopes.includes("entitlements:read")
  )
    return null;
  const { data: permitted, error: ownerError } = await admin.rpc(
    "can_monetize_rocket_app",
    { p_user_id: client.created_by, p_app_id: appId },
  );
  if (ownerError) throw ownerError;
  if (!permitted) return null;
  const { data: account, error: accountError } = await admin
    .from("connect_developer_accounts")
    .select(
      "id,stripe_account_id,status,charges_enabled,payouts_enabled,stripe_api_version,account_configuration",
    )
    .eq("client_id", client.client_id)
    .eq("developer_user_id", client.created_by)
    .eq("is_current", true)
    .maybeSingle();
  if (accountError) throw accountError;
  if (
    !account ||
    account.status !== "active" ||
    !account.charges_enabled ||
    !account.payouts_enabled
  )
    return null;
  if (!(await buyMerchantReadiness(account, stripe)).ready) return null;
  const { data: products, error: productError } = await admin
    .from("connect_products")
    .select(
      "id,client_id,developer_account_id,developer_user_id,product_key,name,amount_cents,currency,interval,billing_type,platform_fee_bps,checkout_return_uris,stripe_product_id,stripe_price_id,price_source,is_active,activated_at,integration_confirmed_at",
    )
    .eq("client_id", client.client_id)
    .eq("developer_account_id", account.id)
    .eq("developer_user_id", client.created_by)
    .eq("is_active", true)
    .not("activated_at", "is", null)
    .not("integration_confirmed_at", "is", null)
    .limit(100);
  if (productError) throw productError;
  const eligible = (products || []).filter(
    (product) =>
      product.platform_fee_bps === 500 &&
      product.platform_fee_bps === configuration.platform_fee_bps,
  );
  if (!eligible.length) return null;
  return { admin, client, account, products: eligible };
}

const publicPlan = (product: {
  id: string;
  product_key?: string;
  checkout_return_uris?: string[];
  name: string;
  amount_cents: number;
  currency: string;
  interval: string | null;
  billing_type?: string;
}) => ({
  id: product.id,
  product_key: product.product_key,
  return_uri: product.checkout_return_uris?.[0],
  name: product.name,
  amount_cents: product.amount_cents,
  currency: product.currency,
  interval: product.interval,
  billing_type: billingType(product),
});

async function existingPurchase(
  admin: ReturnType<typeof getAdmin>,
  userId: string,
  appId: string,
  productKey: string,
) {
  const { data: client, error: clientError } = await admin
    .from("rocket_oauth_clients")
    .select("client_id")
    .eq("app_id", appId)
    .eq("environment", "production")
    .maybeSingle();
  if (clientError) throw clientError;
  if (!client) return null;
  const { data: product, error: productError } = await admin
    .from("connect_products")
    .select("id,product_key,name,amount_cents,currency,interval,billing_type")
    .eq("client_id", client.client_id)
    .eq("product_key", productKey)
    .maybeSingle();
  if (productError) throw productError;
  if (!product) return null;
  const { data: entitlements, error: entitlementError } = await admin
    .from("connect_entitlements")
    .select("status,valid_until,product_id,updated_at")
    .eq("user_id", userId)
    .eq("client_id", client.client_id)
    .eq("product_id", product.id)
    .order("updated_at", { ascending: false })
    .limit(1);
  if (entitlementError) throw entitlementError;
  const entitlement =
    (entitlements || []).find(
      (entry) =>
        ["active", "canceling"].includes(entry.status) &&
        (!entry.valid_until ||
          new Date(entry.valid_until).getTime() > Date.now()),
    ) || entitlements?.[0];
  if (!entitlement && billingType(product) === "one_time") {
    const { data: grant, error: grantError } = await admin
      .from("connect_purchase_grants")
      .select("status,purchase_id,created_at")
      .eq("user_id", userId)
      .eq("client_id", client.client_id)
      .eq("product_id", product.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (grantError) throw grantError;
    if (grant)
      return {
        client,
        product,
        entitlement: { status: grant.status, valid_until: null },
        active: grant.status === "granted",
      };
  }
  if (!entitlement) return null;
  return product
    ? {
        client,
        product,
        entitlement,
        active:
          ["active", "canceling"].includes(entitlement.status) &&
          (!entitlement.valid_until ||
            new Date(entitlement.valid_until).getTime() > Date.now()),
      }
    : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": APP_URL,
        "Access-Control-Allow-Headers":
          "authorization,apikey,content-type,x-client-info",
        "Access-Control-Allow-Methods": "POST,OPTIONS",
        Vary: "Origin",
      },
    });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    const action = text(body.action, 20);
    const admin = getAdmin();

    // Read-only commercial terms for the Developer explanation page.
    // This does not change offer(), merchant readiness, or checkout activation.
    if (action === "configuration") {
      const { data: configuration, error } = await admin
        .from("rocket_buy_configuration")
        .select("platform_fee_bps,live_checkout_enabled")
        .eq("singleton", true)
        .single();
      if (error) throw error;
      return json({
        platform_fee_bps: configuration.platform_fee_bps,
        live_checkout_enabled: configuration.live_checkout_enabled,
      });
    }

    if (action === "library") {
      const user = await getRocketUser(req);
      if (!user) return json({ error: "unauthorized" }, 401);
      const { data: entitlements, error } = await admin
        .from("connect_entitlements")
        .select(
          "id,user_id,client_id,product_id,transaction_id,status,valid_until,updated_at",
        )
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      const { data: grants, error: grantsError } = await admin
        .from("connect_purchase_grants")
        .select("purchase_id,client_id,product_id,status,created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (grantsError) throw grantsError;
      const entries = [
        ...(entitlements || []),
        ...(grants || []).map((entry) => ({
          ...entry,
          valid_until: null,
          one_time: true,
        })),
      ];
      if (!entries.length) return json({ purchases: [] });
      const clientIds = [...new Set(entries.map((entry) => entry.client_id))];
      const productIds = [...new Set(entries.map((entry) => entry.product_id))];
      const [
        { data: clients, error: clientsError },
        { data: products, error: productsError },
      ] = await Promise.all([
        admin
          .from("rocket_oauth_clients")
          .select("client_id,app_id,name,environment,is_active")
          .in("client_id", clientIds)
          .eq("environment", "production"),
        admin
          .from("connect_products")
          .select(
            "id,client_id,name,amount_cents,currency,interval,billing_type",
          )
          .in("id", productIds),
      ]);
      if (clientsError || productsError) throw clientsError || productsError;
      const appIds = (clients || [])
        .map((client) => client.app_id)
        .filter(Boolean);
      const [appResult, orderResult, detailsResult] = await Promise.all([
        appIds.length
          ? admin
              .from("public_apps")
              .select("id,name,website_url")
              .in("id", appIds)
          : { data: [], error: null },
        admin
          .from("connect_transactions")
          .select(
            "id,client_id,product_id,amount_cents,currency,status,created_at",
          )
          .eq("user_id", user.id)
          .in("client_id", clientIds)
          .order("created_at", { ascending: false }),
        appIds.length
          ? admin
              .from("public_marketplace_details")
              .select("app_id,support_url")
              .in("app_id", appIds)
          : { data: [], error: null },
      ]);
      if (appResult.error || orderResult.error || detailsResult.error)
        throw appResult.error || orderResult.error || detailsResult.error;
      return json({
        purchases: libraryPurchases(
          entries,
          clients || [],
          products || [],
          appResult.data || [],
          orderResult.data || [],
          detailsResult.data || [],
        ),
      });
    }

    const appId = text(body.app_id, 36);
    if (!appId || !uuid.test(appId)) return json({ error: "invalid_app" }, 400);
    if (action === "catalog") {
      const available = await offer(appId);
      const offers = available?.products.map(publicPlan) || [];
      return json({ offers, plan: offers.length === 1 ? offers[0] : null });
    }
    const rocketUser = await getRocketUser(req);
    const oauthToken = rocketUser ? null : await getConnectToken(req);
    const user =
      rocketUser ||
      (oauthToken ? { id: oauthToken.user_id, email: undefined } : null);
    if (!user) return json({ error: "unauthorized" }, 401);
    if (oauthToken) {
      const { data: bound } = await admin
        .from("rocket_oauth_clients")
        .select("client_id")
        .eq("app_id", appId)
        .eq("environment", "production")
        .maybeSingle();
      if (
        !oauthToken.scopes.includes("entitlements:read") ||
        bound?.client_id !== oauthToken.client_id
      )
        return json({ error: "client_mismatch" }, 403);
    }
    if (action === "status" || action === "cancel") {
      const productKey = text(body.product_key, 80);
      if (!productKey) return json({ error: "product_key_required" }, 400);
      const purchase = await existingPurchase(
        admin,
        user.id,
        appId,
        productKey,
      );
      if (action === "status") {
        const available = purchase ? null : await offer(appId);
        const availableProduct = available?.products.find(
          (product) => product.product_key === productKey,
        );
        return json({
          plan: purchase
            ? publicPlan(purchase.product)
            : availableProduct
              ? publicPlan(availableProduct)
              : null,
          entitlement: purchase
            ? {
                status: purchase.entitlement.status,
                valid_until: purchase.entitlement.valid_until,
                active: purchase.active,
              }
            : null,
        });
      }
      if (purchase && billingType(purchase.product) === "one_time")
        return json({ error: "one_time_purchase_has_no_subscription" }, 409);
      if (!stripe || !purchase?.active)
        return json({ error: "active_purchase_required" }, 409);
      const { data: transaction, error } = await admin
        .from("connect_transactions")
        .select(
          "id,stripe_subscription_id,stripe_account_id,developer_account_id",
        )
        .eq("user_id", user.id)
        .eq("client_id", purchase.client.client_id)
        .eq("product_id", purchase.product.id)
        .in("status", ["paid", "canceling"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!transaction?.stripe_subscription_id)
        return json({ error: "subscription_not_found" }, 404);
      const { data: account, error: accountError } = await admin
        .from("connect_developer_accounts")
        .select("id,stripe_account_id")
        .eq("id", transaction.developer_account_id)
        .eq("client_id", purchase.client.client_id)
        .eq("stripe_account_id", transaction.stripe_account_id)
        .maybeSingle();
      if (accountError) throw accountError;
      if (!account) return json({ error: "merchant_account_mismatch" }, 409);
      const subscription = await stripe.subscriptions.retrieve(
        transaction.stripe_subscription_id,
        { stripeAccount: account.stripe_account_id },
      );
      if (
        subscription.metadata.rocket_user_id !== user.id ||
        subscription.metadata.rocket_client_id !== purchase.client.client_id ||
        subscription.metadata.rocket_product_id !== purchase.product.id
      )
        return json({ error: "subscription_mismatch" }, 409);
      if (!subscription.cancel_at_period_end)
        await stripe.subscriptions.update(
          subscription.id,
          { cancel_at_period_end: true },
          {
            stripeAccount: account.stripe_account_id,
            idempotencyKey: `rocket-buy-cancel-${subscription.id}`,
          },
        );
      return json({
        cancellation_requested: true,
        active_until: new Date(
          subscription.current_period_end * 1000,
        ).toISOString(),
      });
    }
    const available = await offer(appId);
    if (!available) return json({ error: "buy_unavailable" }, 409);
    const { client, account } = available;
    const productKey = text(body.product_key, 80);
    if (!productKey) return json({ error: "product_key_required" }, 400);
    const product = available.products.find(
      (candidate) => candidate.product_key === productKey,
    );
    if (!product) return json({ error: "offer_not_available" }, 404);
    const { data: entitlement, error: entitlementError } = await admin
      .from("connect_entitlements")
      .select("status,valid_until")
      .eq("user_id", user.id)
      .eq("client_id", client.client_id)
      .eq("product_id", product.id)
      .maybeSingle();
    if (entitlementError) throw entitlementError;
    const hasAccess =
      !!entitlement &&
      ["active", "canceling"].includes(entitlement.status) &&
      (!entitlement.valid_until ||
        new Date(entitlement.valid_until).getTime() > Date.now());
    if (action === "checkout") {
      if (user.id === client.created_by)
        return json({ error: "cannot_buy_own_app" }, 403);
      if (hasAccess && billingType(product) === "subscription")
        return json({ error: "already_purchased" }, 409);
      const oneTime = billingType(product) === "one_time";
      if (body.client_id !== undefined && body.client_id !== client.client_id)
        return json({ error: "client_mismatch" }, 403);
      if (
        typeof body.purchase_request_id !== "string" ||
        !uuid.test(body.purchase_request_id)
      )
        return json({ error: "purchase_request_id_required" }, 400);
      if (!product.checkout_return_uris?.includes(body.return_uri))
        return json({ error: "invalid_return_uri" }, 400);
      if (!stripe) return json({ error: "buy_unavailable" }, 503);
      const { data: previousTransactions, error: previousError } = await admin
        .from("connect_transactions")
        .select("stripe_subscription_id")
        .eq("user_id", user.id)
        .eq("client_id", client.client_id)
        .eq("product_id", product.id)
        .eq("stripe_account_id", account.stripe_account_id)
        .not("stripe_subscription_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(3);
      if (previousError) throw previousError;
      for (const previous of oneTime ? [] : previousTransactions || []) {
        const subscription = await stripe.subscriptions.retrieve(
          previous.stripe_subscription_id,
          { stripeAccount: account.stripe_account_id },
        );
        if (!["canceled", "incomplete_expired"].includes(subscription.status))
          return json({ error: "existing_subscription_needs_attention" }, 409);
      }
      if (!product.price_source || product.price_source === "stripe_price") {
        if (!product.stripe_price_id)
          return json({ error: "plan_not_ready" }, 409);
        const price = await stripe.prices.retrieve(product.stripe_price_id, {
          stripeAccount: account.stripe_account_id,
        });
        if (!priceMatches(product, price, true))
          return json({ error: "plan_not_ready" }, 409);
      } else if (
        product.price_source !== "inline" ||
        !oneTime ||
        product.stripe_price_id ||
        product.stripe_product_id
      ) {
        return json({ error: "plan_not_ready" }, 409);
      }
      const requestKey = `rocket-buy-production-${user.id}-${client.client_id}-${product.id}-${body.purchase_request_id}`;
      let existingQuery = admin
        .from("connect_checkout_attempts")
        .select("stripe_checkout_session_id")
        .eq("user_id", user.id)
        .eq("client_id", client.client_id)
        .eq("product_id", product.id)
        .eq("stripe_account_id", account.stripe_account_id)
        .not("stripe_checkout_session_id", "is", null)
        .limit(1);
      existingQuery = existingQuery.eq("idempotency_key", requestKey);
      const { data: existing } = await existingQuery;
      if (existing?.[0]?.stripe_checkout_session_id) {
        const previous = await stripe.checkout.sessions.retrieve(
          existing[0].stripe_checkout_session_id,
          { stripeAccount: account.stripe_account_id },
        );
        if (previous.status === "open" && previous.url)
          return json({ checkout_url: previous.url, reused: true });
        return json(
          {
            error: "purchase_request_already_used",
            checkout_status: previous.status,
          },
          409,
        );
      }
      const { data: customerRow } = await admin
        .from("connect_customers")
        .select("stripe_customer_id")
        .eq("user_id", user.id)
        .eq("developer_account_id", account.id)
        .maybeSingle();
      let customerId = customerRow?.stripe_customer_id;
      if (!customerId) {
        const customer = await stripe.customers.create(
          {
            email: user.email || undefined,
            metadata: {
              rocket_user_id: user.id,
              rocket_client_id: client.client_id,
            },
          },
          { stripeAccount: account.stripe_account_id },
        );
        customerId = customer.id;
        const { error } = await admin
          .from("connect_customers")
          .upsert(
            {
              user_id: user.id,
              developer_account_id: account.id,
              stripe_customer_id: customerId,
            },
            { onConflict: "user_id,developer_account_id" },
          );
        if (error) throw error;
      }
      const now = Date.now();
      const idempotencyKey = requestKey;
      const metadata = {
        rocket_user_id: user.id,
        rocket_client_id: client.client_id,
        rocket_product_id: product.id,
      };
      if (oneTime && product.platform_fee_bps !== 500)
        return json({ error: "platform_fee_configuration_invalid" }, 409);
      // Record the buyer, immutable offer and connected merchant before
      // opening Stripe. Concurrent requests reuse the same idempotency key.
      const { error: reserveError } = await admin
        .from("connect_checkout_attempts")
        .upsert(
          {
            user_id: user.id,
            client_id: client.client_id,
            product_id: product.id,
            stripe_account_id: account.stripe_account_id,
            idempotency_key: idempotencyKey,
            expires_at: new Date(now + 30 * 60_000).toISOString(),
          },
          { onConflict: "idempotency_key", ignoreDuplicates: true },
        );
      if (reserveError) throw reserveError;
      const session = await stripe.checkout.sessions.create(
        {
          mode: oneTime ? "payment" : "subscription",
          customer: customerId,
          payment_method_types: ["card"],
          line_items: [
            product.price_source === "inline"
              ? {
                  price_data: {
                    currency: product.currency,
                    unit_amount: product.amount_cents,
                    product_data: { name: product.name },
                  },
                  quantity: 1,
                }
              : { price: product.stripe_price_id, quantity: 1 },
          ],
          success_url: body.return_uri,
          cancel_url: body.return_uri,
          ...(oneTime
            ? {
                payment_intent_data: {
                  application_fee_amount: Math.round(
                    (product.amount_cents * product.platform_fee_bps) / 10000,
                  ),
                  metadata,
                },
              }
            : {
                subscription_data: {
                  application_fee_percent: product.platform_fee_bps / 100,
                  metadata,
                },
              }),
          metadata: {
            rocket_user_id: user.id,
            rocket_client_id: client.client_id,
            rocket_product_id: product.id,
          },
        },
        { stripeAccount: account.stripe_account_id, idempotencyKey },
      );
      if (!session.url) return json({ error: "checkout_unavailable" }, 503);
      const { error } = await admin
        .from("connect_checkout_attempts")
        .update({ stripe_checkout_session_id: session.id })
        .eq("idempotency_key", idempotencyKey)
        .eq("user_id", user.id)
        .eq("client_id", client.client_id)
        .eq("product_id", product.id)
        .eq("stripe_account_id", account.stripe_account_id);
      if (error) throw error;
      return json({ checkout_url: session.url, reused: false });
    }
    return json({ error: "invalid_action" }, 400);
  } catch (error) {
    console.error("rocket-buy", error);
    return json({ error: "buy_unavailable" }, 500);
  }
});
