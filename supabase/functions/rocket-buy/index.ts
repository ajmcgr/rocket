import Stripe from "npm:stripe@16.12.0";
import { APP_URL, getAdmin, getRocketUser, getConnectToken, json } from "../_shared/rocketConnect.ts";
import { buyMerchantReadiness } from "../_shared/buyMerchant.ts";
import { billingType, priceMatches } from "../_shared/oneTimePayments.ts";
import { liveWebhookConfigured } from "../_shared/connectLiveConfiguration.ts";
import { libraryPurchases, sandboxLibraryPurchases } from "../_shared/buyerLibrary.ts";

const key = Deno.env.get("STRIPE_SECRET_KEY");
const stripe = key?.startsWith("sk_live_") ? new Stripe(key, { apiVersion: "2024-06-20" }) : null;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const text = (value: unknown, max: number) => typeof value === "string" && value.length > 0 && value.length <= max ? value : null;

async function offer(appId: string) {
  const admin = getAdmin();
  const { data: configuration, error: configError } = await admin.from("rocket_buy_configuration")
    .select("platform_fee_bps,live_checkout_enabled,multi_plan_enabled").eq("singleton", true).single();
  if (configError) throw configError;
  if (!stripe || !configuration.live_checkout_enabled || !liveWebhookConfigured(Deno.env.get("STRIPE_CONNECT_LIVE_WEBHOOK_SECRET"), Deno.env.get("STRIPE_WEBHOOK_SECRET"))) return null;
  const { data: client, error: clientError } = await admin.from("rocket_oauth_clients")
    .select("client_id,app_id,created_by,is_active,allowed_scopes")
    .eq("app_id", appId).eq("environment", "production").eq("is_active", true).maybeSingle();
  if (clientError) throw clientError;
  if (!client?.created_by || !client.allowed_scopes.includes("entitlements:read")) return null;
  const { data: permitted, error: ownerError } = await admin.rpc("can_monetize_rocket_app", { p_user_id: client.created_by, p_app_id: appId });
  if (ownerError) throw ownerError;
  if (!permitted) return null;
  const { data: account, error: accountError } = await admin.from("connect_developer_accounts")
    .select("id,stripe_account_id,status,charges_enabled,payouts_enabled,stripe_api_version,account_configuration")
    .eq("client_id", client.client_id).eq("developer_user_id", client.created_by).eq("is_current", true).maybeSingle();
  if (accountError) throw accountError;
  if (!account || account.status !== "active" || !account.charges_enabled || !account.payouts_enabled) return null;
  if (!(await buyMerchantReadiness(account, stripe)).ready) return null;
  const productQuery = admin.from("connect_products")
    .select("id,client_id,developer_account_id,developer_user_id,product_key,entitlement_key,description,name,amount_cents,currency,interval,billing_type,platform_fee_bps,checkout_return_uris,stripe_product_id,stripe_price_id,is_active,activated_at,integration_confirmed_at",
    )
    .eq("client_id", client.client_id).eq("developer_account_id", account.id).eq("developer_user_id", client.created_by)
    .eq("is_active", true).not("activated_at", "is", null).order("created_at", { ascending: true });
  const { data: products, error: productError } = await productQuery;
  if (productError) throw productError;
  if (!products?.length || (!configuration.multi_plan_enabled && products.length !== 1 )
  ) return null;
  const eligible = products.filter(
    (p) =>
      p.platform_fee_bps === 500 &&
      p.platform_fee_bps === configuration.platform_fee_bps &&
      (billingType(p) !== "one_time" ||
        (p.product_key && p.checkout_return_uris?.length)) );
  return eligible.length
    ? { admin, client, account, products: eligible } : null;
}

const publicPlan = (product: { id: string; name: string; amount_cents: number; currency: string; interval: string | null; billing_type?: string; product_key?: string; checkout_return_uris?: string[];
  entitlement_key?: string;
  description?: string;
}) =>
  ({ id: product.id,
  entitlement_key: product.entitlement_key || product.product_key,
  description: product.description || "", name: product.name, amount_cents: product.amount_cents, currency: product.currency, interval: product.interval, billing_type: billingType(product),
    ...(billingType(product) === "one_time" ? { product_key: product.product_key, return_uri: product.checkout_return_uris?.[0] } : {}) });

async function existingPurchase(admin: ReturnType<typeof getAdmin>, userId: string, appId: string,
  offerId?: string,
) {
  const { data: client, error: clientError } = await admin.from("rocket_oauth_clients")
    .select("client_id").eq("app_id", appId).eq("environment", "production").maybeSingle();
  if (clientError) throw clientError;
  if (!client) return null;
  const { data: entitlements, error: entitlementError } = await admin.from("connect_entitlements")
    .select("status,valid_until,revoked_at,product_id,updated_at").eq("user_id", userId).eq("client_id", client.client_id)
    .order("updated_at", { ascending: false });
  if (entitlementError) throw entitlementError;
  const scoped = (entitlements || []).filter(
    (entry) => !offerId || entry.product_id === offerId,
  );
  const entitlement =
    scoped.find((entry) => !entry.revoked_at &&
        ["active", "canceling"].includes(entry.status) && (!entry.valid_until || new Date(entry.valid_until).getTime() > Date.now())) || scoped[0];
  if (!entitlement) return null;
  const { data: product, error: productError } = await admin.from("connect_products")
    .select("id,product_key,entitlement_key,description,name,amount_cents,currency,interval,billing_type",
    ).eq("id", entitlement.product_id).eq("client_id", client.client_id).maybeSingle();
  if (productError) throw productError;
  return product ? { client, product, entitlement,
    active: !entitlement.revoked_at &&
          ["active", "canceling"].includes(entitlement.status) && (!entitlement.valid_until || new Date(entitlement.valid_until).getTime() > Date.now()) } : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: { "Access-Control-Allow-Origin": APP_URL, "Access-Control-Allow-Headers": "authorization,apikey,content-type,x-client-info", "Access-Control-Allow-Methods": "POST,OPTIONS", Vary: "Origin" } });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    const action = text(body.action, 20);
    const admin = getAdmin();

    // Read-only commercial terms for the Developer explanation page.
    // This does not change offer(), merchant readiness, or checkout activation.
    if (action === "configuration") {
      const { data: configuration, error } = await admin.from("rocket_buy_configuration")
        .select("platform_fee_bps,live_checkout_enabled,multi_plan_enabled").eq("singleton", true).single();
      if (error) throw error;
      return json({ platform_fee_bps: configuration.platform_fee_bps, live_checkout_enabled: configuration.live_checkout_enabled });
    }

    if (action === "library") {
      const user = await getRocketUser(req);
      if (!user) return json({ error: "unauthorized" }, 401);
      const { data: entitlements, error } = await admin.from("connect_entitlements")
        .select("id,user_id,client_id,product_id,transaction_id,status,valid_until,updated_at")
        .eq("user_id", user.id).order("updated_at", { ascending: false });
      if (error) throw error;
      const { data: grants, error: grantsError } = await admin.from("connect_purchase_grants")
        .select("purchase_id,client_id,product_id,status,created_at").eq("user_id", user.id).order("created_at", { ascending: false });
      if (grantsError) throw grantsError;
      const entries = [ ...(entitlements || []), ...(grants || []).map((entry) => ({ ...entry, valid_until: null, one_time: true })) ];
      if (!entries.length) return json({ purchases: [], sandbox_purchases: [] });
      const clientIds = [...new Set(entries.map((entry) => entry.client_id))];
      const productIds = [...new Set(entries.map((entry) => entry.product_id))];
      const [{ data: clients, error: clientsError }, { data: products, error: productsError }] = await Promise.all([
        admin.from("rocket_oauth_clients").select("client_id,app_id,name,environment,is_active").in("client_id", clientIds),
        admin.from("connect_products").select("id,client_id,product_key,entitlement_key,description,name,amount_cents,currency,interval,billing_type",
          ).in("id", productIds),
      ]);
      if (clientsError || productsError) throw clientsError || productsError;
      const appIds = (clients || []).map((client) => client.app_id).filter(Boolean);
      const [appResult, orderResult, detailsResult] = await Promise.all([
        appIds.length ? admin.from("public_apps").select("id,name,website_url").in("id", appIds) : { data: [], error: null },
        admin.from("connect_transactions").select("id,client_id,product_id,amount_cents,currency,status,created_at")
          .eq("user_id", user.id).in("client_id", clientIds).order("created_at", { ascending: false }),
        appIds.length ? admin.from("public_marketplace_details").select("app_id,support_url").in("app_id", appIds) : { data: [], error: null },
      ]);
      if (appResult.error || orderResult.error || detailsResult.error) throw appResult.error || orderResult.error || detailsResult.error;
      return json({
        purchases: libraryPurchases(entries, clients || [], products || [], appResult.data || [], orderResult.data || [], detailsResult.data || []),
        sandbox_purchases: sandboxLibraryPurchases(
          (grants || []).map((grant) => ({ ...grant, one_time: true })),
          clients || [], products || [], orderResult.data || [],
        ),
      });
    }

    const appId = text(body.app_id, 36);
    if (!appId || !uuid.test(appId)) return json({ error: "invalid_app" }, 400);
    if (action === "catalog") {
      const available = await offer(appId);
      const plans = available?.products.map(publicPlan) || [];
      const viewer = available ? await getRocketUser(req) : null;
      return json({
        plans,
        plan: plans.length === 1 ? plans[0] : null,
        viewer_is_seller: !!viewer && viewer.id === available?.client.created_by,
      });
    }
    const rocketUser = await getRocketUser(req);
    const oauthToken = rocketUser ? null : await getConnectToken(req);
    const user = rocketUser || (oauthToken ? { id: oauthToken.user_id, email: undefined } : null);
    if (!user) return json({ error: "unauthorized" }, 401);
    if (oauthToken) {
      const { data: bound } = await admin.from("rocket_oauth_clients").select("client_id").eq("app_id", appId).eq("environment", "production").maybeSingle();
      if (!oauthToken.scopes.includes("entitlements:read") || bound?.client_id !== oauthToken.client_id) return json({ error: "client_mismatch" }, 403);
    }
    if (action === "status" || action === "cancel") {
      if (
        body.offer_id !== undefined &&
        (typeof body.offer_id !== "string" || !uuid.test(body.offer_id))
      )
        return json({ error: "invalid_offer" }, 400);
      const purchase = await existingPurchase(admin, user.id, appId,
        action === "cancel" ? body.offer_id : undefined,
      );
      if (action === "status") {
        const available = await offer(appId);
        const plans = available?.products.map(publicPlan) || [];
        return json({ plans,
          plan:
            plans.length === 1
              ? plans[0]
              : purchase ? publicPlan(purchase.product) : null,
          entitlement: purchase ? { offer_id: purchase.product.id,
                plan_name: purchase.product.name,
                billing_type: billingType(purchase.product),
                status: purchase.entitlement.status, valid_until: purchase.entitlement.valid_until, active: purchase.active } : null });
      }
      if (purchase && billingType(purchase.product) === "one_time") return json({ error: "one_time_purchase_has_no_subscription" }, 409);
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
    if (action !== "checkout") return json({ error: "invalid_action" }, 400);
    const available = await offer(appId);
    if (!available) return json({ error: "buy_unavailable" }, 409);
    const { client, account} = available;
    const selected =
      body.offer_id !== undefined
        ? available.products.find((p) => p.id === body.offer_id)
        : body.product_key !== undefined
          ? available.products.find((p) => p.product_key === body.product_key)
          : available.products.length === 1
            ? available.products[0]
            : null;
    if (!selected)
      return json(
        {
          error:
            body.offer_id || body.product_key
              ? "offer_not_published"
              : "offer_selection_required",
        },
        409,
      );
    const product = selected;
    const { data: entitlement, error: entitlementError } = await admin.from("connect_entitlements")
      .select("status,valid_until").eq("user_id", user.id).eq("client_id", client.client_id).eq("product_id", product.id).maybeSingle();
    if (entitlementError) throw entitlementError;
    const hasAccess = !!entitlement && ["active", "canceling"].includes(entitlement.status) && (!entitlement.valid_until || new Date(entitlement.valid_until).getTime() > Date.now());
    if (action === "checkout") {
      if (user.id === client.created_by) return json({ error: "cannot_buy_own_app" }, 403);
      if (hasAccess && billingType(product) === "subscription") return json({ error: "already_purchased" }, 409);
      if (body.product_key !== undefined && body.product_key !== product.product_key) return json({ error: "product_mismatch" }, 403);
      const oneTime = billingType(product) === "one_time";
      if (oneTime && body.product_key !== product.product_key) return json({ error: "product_key_required" }, 400);
      if (body.client_id !== undefined && body.client_id !== client.client_id) return json({ error: "client_mismatch" }, 403);
      if (oneTime && (typeof body.purchase_request_id !== "string" || !uuid.test(body.purchase_request_id))) return json({ error: "purchase_request_id_required" }, 400);
      if (oneTime && !product.checkout_return_uris?.includes(body.return_uri)) return json({ error: "invalid_return_uri" }, 400);
      if (!stripe) return json({ error: "buy_unavailable" }, 503);
      const previousTransactions: Array<{
        stripe_subscription_id: string;
        stripe_account_id: string;
        stripe_checkout_session_id?: string;
      }> = [];
      if (!oneTime)
        for (let from = 0; ; from += 1000) {
          const { data: page, error} = await admin.from("connect_transactions")
        .select("stripe_subscription_id,stripe_account_id,stripe_checkout_session_id",
            ).eq("user_id", user.id).eq("client_id", client.client_id)
        .not("stripe_subscription_id", "is", null).order("created_at", { ascending: false }).range(from, from + 999);
      if (error) throw error;
      previousTransactions.push(...(page || []));
          if (!page || page.length < 1000) break;
        }
      for (const previous of oneTime ? [] : previousTransactions || []) {
        const subscription = await stripe.subscriptions.retrieve(previous.stripe_subscription_id, { stripeAccount: previous.stripe_account_id });
        if (!["canceled", "incomplete_expired"].includes(subscription.status)) return json({ error: "existing_subscription_needs_attention" }, 409);
      }
      const price = await stripe.prices.retrieve(product.stripe_price_id, { stripeAccount: account.stripe_account_id });
      if (!priceMatches(product, price, true)) return json({ error: "plan_not_ready" }, 409);
      const requestKey = oneTime ? `rocket-buy-production-${user.id}-${client.client_id}-${product.id}-${body.purchase_request_id}` : null;
      const origin =
        oauthToken || body.source === "developer_website"
          ? "EXTERNAL_BUTTON"
          : "ROCKET_MARKETPLACE";
      const saveAttempt = async (
        session: { id: string; expires_at: number },
        idempotencyKey: string,
        savedOrigin: string,
      ) => {
        const { error } = await admin
          .from("connect_checkout_attempts")
          .upsert(
            {
              user_id: user.id,
              client_id: client.client_id,
              product_id: product.id,
              stripe_account_id: account.stripe_account_id,
              origin: savedOrigin,
              idempotency_key: idempotencyKey,
              stripe_checkout_session_id: session.id,
              expires_at: new Date(session.expires_at * 1000).toISOString(),
            },
            { onConflict: "idempotency_key" },
          );
        if (error) throw error;
      };
      let reservation: {
        idempotency_key: string;
        expires_at: string;
        stripe_checkout_session_id: string | null;
        product_id: string;
        stripe_account_id: string;
        origin: string;
      } | null = null;
      if (!oneTime) {
        // Includes old sessions whose Stripe lifetime exceeded their local expiry.
        const attempts: Array<{
          stripe_checkout_session_id: string;
          product_id: string;
          stripe_account_id: string;
        }> = [];
        for (let from = 0; ; from += 1000) {
          const { data: page, error } = await admin
            .from("connect_checkout_attempts")
            .select(
              "stripe_checkout_session_id,product_id,stripe_account_id,connect_products!inner(billing_type)",
            )
            .eq("user_id", user.id)
            .eq("client_id", client.client_id)
            .eq("connect_products.billing_type", "subscription")
            .order("created_at", { ascending: false })
            .range(from, from + 999);
          if (error) throw error;
          attempts.push(...(page || []));
          if (!page || page.length < 1000) break;
        }
        for (const attempt of attempts || []) {
          if (
            !attempt.stripe_checkout_session_id ||
            previousTransactions.some(
              (t) =>
                t.stripe_checkout_session_id ===
                  attempt.stripe_checkout_session_id &&
                t.stripe_account_id === attempt.stripe_account_id,
            )
          )
            continue;
          const prior = await stripe.checkout.sessions.retrieve(
            attempt.stripe_checkout_session_id,
            { stripeAccount: attempt.stripe_account_id },
          );
          if (prior.mode !== "subscription" || prior.status === "expired")
            continue;
          if (
            prior.status === "open" &&
            prior.url &&
            attempt.product_id === product.id &&
            attempt.stripe_account_id === account.stripe_account_id
          )
            return json({ checkout_url: prior.url, reused: true });
          if (
            prior.status === "complete" &&
            typeof prior.subscription === "string"
          ) {
            const subscription = await stripe.subscriptions.retrieve(
              prior.subscription,
              { stripeAccount: attempt.stripe_account_id },
            );
            if (
              ["canceled", "incomplete_expired"].includes(subscription.status)
            )
              continue;
          }
          return json({ error: "existing_subscription_needs_attention" }, 409);
        }
        const { data: reserved, error: reserveError } = await admin.rpc(
          "connect_reserve_subscription",
          {
            p_user_id: user.id,
            p_client_id: client.client_id,
            p_product_id: product.id,
            p_account: account.stripe_account_id,
            p_origin: origin,
          },
        );
        if (reserveError) throw reserveError;
        reservation = reserved;
        if (!reservation) throw new Error("Missing checkout reservation");
        if (reservation.stripe_checkout_session_id) {
          const prior = await stripe.checkout.sessions.retrieve(
            reservation.stripe_checkout_session_id,
            { stripeAccount: reservation.stripe_account_id },
          );
          const completedSubscription =
            prior.status === "complete" &&
            typeof prior.subscription === "string"
              ? await stripe.subscriptions.retrieve(prior.subscription, {
                  stripeAccount: reservation.stripe_account_id,
                })
              : null;
          if (
            prior.status === "expired" ||
            (completedSubscription &&
              ["canceled", "incomplete_expired"].includes(
                completedSubscription.status,
              ))
          ) {
            const { error: releaseError } = await admin
              .from("connect_subscription_checkouts")
              .delete()
              .eq("user_id", user.id)
              .eq("client_id", client.client_id)
              .eq("idempotency_key", reservation.idempotency_key);
            if (releaseError) throw releaseError;
            return json({ error: "checkout_expired_retry" }, 409);
          }
          if (
            reservation.product_id === product.id &&
            prior.status === "open" &&
            prior.url
          ) {
            await saveAttempt(
              prior,
              `rocket-buy-subscription-${reservation.idempotency_key}`,
              reservation.origin,
            );
            return json({ checkout_url: prior.url, reused: true });
          }
          return json({ error: "existing_subscription_needs_attention" }, 409);
        }
        if (
          reservation.product_id !== product.id ||
          reservation.stripe_account_id !== account.stripe_account_id
        )
          return json({ error: "checkout_in_progress_for_another_plan" }, 409);
        const { data: existingCustomer, error: customerLookupError } =
          await admin
            .from("connect_customers")
            .select("stripe_customer_id")
            .eq("user_id", user.id)
            .eq("developer_account_id", account.id)
            .maybeSingle();
        if (customerLookupError) throw customerLookupError;
        if (existingCustomer?.stripe_customer_id) {
          const sessions = await stripe.checkout.sessions.list(
            { customer: existingCustomer.stripe_customer_id, limit: 100 },
            { stripeAccount: account.stripe_account_id },
          );
          const prior = sessions.data.find(
            (entry) =>
              entry.metadata?.rocket_checkout_key ===
                reservation!.idempotency_key &&
              entry.metadata?.rocket_user_id === user.id &&
              entry.metadata?.rocket_product_id === product.id,
          );
          if (prior) {
            const { error: recoveryError } = await admin
              .from("connect_subscription_checkouts")
              .update({ stripe_checkout_session_id: prior.id })
              .eq("user_id", user.id)
              .eq("client_id", client.client_id)
              .eq("idempotency_key", reservation.idempotency_key);
            if (recoveryError) throw recoveryError;
            if (prior.status === "open" && prior.url) {
              await saveAttempt(
                prior,
                `rocket-buy-subscription-${reservation.idempotency_key}`,
                reservation.origin,
              );
              return json({ checkout_url: prior.url, reused: true });
            }
            return json({ error: "checkout_expired_retry" }, 409);
          }
        }
        // Fail closed when an uncertain request cannot be reconciled. Never
        // recycle a key merely because a clock expired.
        if (
          new Date(reservation.expires_at).getTime() <=
          Date.now() + 30 * 60000
        )
          return json({ error: "checkout_pending_reconciliation" }, 409);
      } else {
        const { data: existing, error: attemptError } = await admin.from("connect_checkout_attempts")
          .select("stripe_checkout_session_id,expires_at")
          .eq("user_id", user.id).eq("client_id", client.client_id).eq("product_id", product.id)
          .eq("stripe_account_id", account.stripe_account_id).eq("idempotency_key", requestKey).maybeSingle();
        if (attemptError) throw attemptError;
        if (existing && !existing.stripe_checkout_session_id && new Date(existing.expires_at).getTime() <= Date.now())
          return json({ error: "checkout_pending_reconciliation" }, 409);
        if (existing?.stripe_checkout_session_id) {
          const prior = await stripe.checkout.sessions.retrieve(existing.stripe_checkout_session_id, { stripeAccount: account.stripe_account_id });
          if (prior.status === "open" && prior.url) return json({ checkout_url: prior.url, reused: true });
          return json({ error: "purchase_request_already_used", checkout_status: prior.status }, 409);
        }
      }
      const { data: customerRow } = await admin.from("connect_customers").select("stripe_customer_id")
        .eq("user_id", user.id).eq("developer_account_id", account.id).maybeSingle();
      let customerId = customerRow?.stripe_customer_id;
      if (!customerId) {
        const customer = await stripe.customers.create({ metadata: { rocket_user_id: user.id, rocket_client_id: client.client_id } }, { stripeAccount: account.stripe_account_id ,
            idempotencyKey: `rocket-buyer-${user.id}-${account.id}`,
          });
        customerId = customer.id;
        const { error } = await admin.from("connect_customers").upsert({ user_id: user.id, developer_account_id: account.id, stripe_customer_id: customerId }, { onConflict: "user_id,developer_account_id" });
        if (error) throw error;
      }
      const idempotencyKey = requestKey || `rocket-buy-subscription-${reservation!.idempotency_key}`;
      const returnUrl = `${APP_URL}/apps/${appId}`;
      const metadata = { rocket_user_id: user.id, rocket_client_id: client.client_id, rocket_product_id: product.id ,
        rocket_app_id: appId,
        rocket_entitlement_key: product.entitlement_key,
        rocket_origin: reservation?.origin || origin,
        rocket_checkout_key: reservation?.idempotency_key || requestKey!,
      };
      if (oneTime && product.platform_fee_bps !== 500) return json({ error: "platform_fee_configuration_invalid" }, 409);
      const { data: frozen, error: freezeError } = await admin.rpc("connect_freeze_checkout", {
        p_user_id: user.id, p_client_id: client.client_id, p_product_id: product.id,
        p_account: account.stripe_account_id, p_key: idempotencyKey, p_entitlement_key: product.entitlement_key,
        p_origin: reservation?.origin || origin,
        p_expires_at: reservation?.expires_at || new Date(Date.now()+24*60*60_000).toISOString(),
      });
      if (freezeError) throw freezeError;
      if (!frozen) return json({ error: "checkout_offer_changed" }, 409);
      const session = await stripe.checkout.sessions.create({
        ...(reservation
            ? {
                expires_at: Math.floor(
                  new Date(reservation.expires_at).getTime() / 1000,
                ),
              }
            : {}),
          mode: oneTime ? "payment" : "subscription", customer: customerId, payment_method_types: ["card"], line_items: [{ price: product.stripe_price_id, quantity: 1 }],
        ...(oneTime ? {} : { allow_promotion_codes: true }),
        success_url: oneTime ? body.return_uri : `${returnUrl}?purchase=processing`, cancel_url: `${returnUrl}?purchase=cancelled`,
        ...(oneTime ? { payment_intent_data: { application_fee_amount: Math.round((product.amount_cents * product.platform_fee_bps ) / 10000), metadata } } : { subscription_data: { application_fee_percent: product.platform_fee_bps / 100, metadata } }),
        metadata}, { stripeAccount: account.stripe_account_id, idempotencyKey });
      if (!session.url) return json({ error: "checkout_unavailable" }, 503);
      if (reservation) {
        const { error : reservationError } = await admin.from("connect_subscription_checkouts").update({ stripe_checkout_session_id: session.id}).eq("user_id", user.id) .eq("client_id", client.client_id)
          .eq("idempotency_key" , reservation.idempotency_key);
      if (reservationError) throw reservationError;
      }
      await saveAttempt(session, idempotencyKey, reservation?.origin || origin);
      return json({ checkout_url: session.url, reused: false });
    }
    return json({ error: "invalid_action" }, 400);
  } catch (error) {
    console.error("rocket-buy", error);
    return json({ error: "buy_unavailable" }, 500);
  }
});
