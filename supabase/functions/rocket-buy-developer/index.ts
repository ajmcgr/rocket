import Stripe from "npm:stripe@16.12.0";
import {
  APP_URL,
  base64url,
  getAdmin,
  getRocketUser,
  json,
} from "../_shared/rocketConnect.ts";
import {
  createStripeConnectV2Merchant,
  createStripeHostedOnboardingLink,
  StripeConnectV2Error,
} from "../_shared/stripeConnectV2.ts";
import { buyMerchantReadiness } from "../_shared/buyMerchant.ts";
import {
  approvedPaymentReturn,
  importableStripePrice,
  priceMatches,
} from "../_shared/oneTimePayments.ts";
import { liveWebhookConfigured } from "../_shared/connectLiveConfiguration.ts";

const liveKey = Deno.env.get("STRIPE_SECRET_KEY");
const stripe = liveKey?.startsWith("sk_live_")
  ? new Stripe(liveKey, { apiVersion: "2024-06-20" })
  : null;
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const shortText = (value: unknown, max: number) =>
  typeof value === "string" &&
  value.trim().length > 0 &&
  value.trim().length <= max
    ? value.trim()
    : null;
const productKey = (name: string) =>
  `${
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "access"
  }-${base64url(crypto.getRandomValues(new Uint8Array(5))).toLowerCase()}`;

async function context(req: Request, appId: string) {
  const user = await getRocketUser(req);
  if (!user) return { error: json({ error: "unauthorized" }, 401) };
  const admin = getAdmin();
  const { data: permitted, error } = await admin.rpc(
    "can_monetize_rocket_app",
    { p_user_id: user.id, p_app_id: appId },
  );
  if (error) throw error;
  if (!permitted)
    return {
      error: json(
        { error: "rocket_developer_and_verified_ownership_required" },
        403,
      ),
    };
  const { data: client, error: clientError } = await admin
    .from("rocket_oauth_clients")
    .select("client_id,app_id,name,redirect_uris,allowed_scopes,is_active")
    .eq("app_id", appId)
    .eq("created_by", user.id)
    .eq("environment", "production")
    .maybeSingle();
  if (clientError) throw clientError;
  if (
    !client ||
    !client.is_active ||
    !client.allowed_scopes.includes("entitlements:read")
  ) {
    return { error: json({ error: "production_rocket_id_required" }, 409) };
  }
  return { user, admin, client };
}

async function currentAccount(
  admin: ReturnType<typeof getAdmin>,
  clientId: string,
  userId: string,
) {
  const { data, error } = await admin
    .from("connect_developer_accounts")
    .select(
      "id,client_id,developer_user_id,stripe_account_id,status,charges_enabled,payouts_enabled,is_current,stripe_api_version,account_configuration",
    )
    .eq("client_id", clientId)
    .eq("developer_user_id", userId)
    .eq("is_current", true)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  if (!stripe) return { ...data, ready: false };
  const merchant = await buyMerchantReadiness(data, stripe);
  const ready = merchant.ready;
  if (
    data.charges_enabled !== merchant.chargesEnabled ||
    data.payouts_enabled !== merchant.payoutsEnabled ||
    data.status !== (ready ? "active" : "pending")
  ) {
    const { error: updateError } = await admin
      .from("connect_developer_accounts")
      .update({
        status: ready ? "active" : "pending",
        charges_enabled: merchant.chargesEnabled,
        payouts_enabled: merchant.payoutsEnabled,
        updated_at: new Date().toISOString(),
        account_configuration: merchant.configuration,
      })
      .eq("id", data.id);
    if (updateError) throw updateError;
  }
  return {
    ...data,
    status: ready ? "active" : "pending",
    charges_enabled: merchant.chargesEnabled,
    payouts_enabled: merchant.payoutsEnabled,
    ready,
  };
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
    const appId = shortText(body.app_id, 36);
    if (!appId || !uuid.test(appId)) return json({ error: "invalid_app" }, 400);
    const ctx = await context(req, appId);
    if ("error" in ctx) return ctx.error!;
    const { user, admin, client } = ctx;
    if (!user || !admin || !client) return json({ error: "unavailable" }, 500);
    const action = shortText(body.action, 40);
    if (body.client_id !== undefined && body.client_id !== client.client_id)
      return json({ error: "client_mismatch" }, 403);
    if (!stripe) return json({ error: "live_connect_not_configured" }, 503);

    if (action === "status") {
      const account = await currentAccount(admin, client.client_id, user.id);
      const { data: products, error } = await admin
        .from("connect_products")
        .select(
          "id,product_key,name,amount_cents,currency,interval,billing_type,platform_fee_bps,is_active,activated_at,integration_confirmed_at,developer_account_id",
        )
        .eq("client_id", client.client_id)
        .eq("developer_user_id", user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const { data: configuration, error: configurationError } = await admin
        .from("rocket_buy_configuration")
        .select("platform_fee_bps,live_checkout_enabled")
        .eq("singleton", true)
        .single();
      if (configurationError) throw configurationError;
      return json({
        app_id: appId,
        client_id: client.client_id,
        merchant: account
          ? {
              ready: account.ready,
              status: account.status,
              stripe_api_version: account.stripe_api_version,
              stripe_account_id: account.stripe_account_id,
              connection_method:
                account.account_configuration?.connection_method || "rocket",
            }
          : null,
        products: (products || []).filter(
          (p) => p.developer_account_id === account?.id,
        ),
        platform_fee_bps: configuration.platform_fee_bps,
        launch_ready:
          configuration.live_checkout_enabled &&
          liveWebhookConfigured(
            Deno.env.get("STRIPE_CONNECT_LIVE_WEBHOOK_SECRET"),
            Deno.env.get("STRIPE_WEBHOOK_SECRET"),
          ),
      });
    }

    if (action === "stripe_onboarding") {
      let account = await currentAccount(admin, client.client_id, user.id);
      if (account?.account_configuration?.connection_method === "oauth")
        return json({ error: "existing_account_uses_stripe_dashboard" }, 409);
      if (!account) {
        const country = shortText(body.country, 2);
        if (!country || !/^[A-Za-z]{2}$/.test(country))
          return json({ error: "invalid_business_country" }, 400);
        const remote = await createStripeConnectV2Merchant({
          email: user.email || undefined,
          displayName: client.name,
          clientId: client.client_id,
          userId: user.id,
          country,
          environment: "production",
        });
        if (!remote.id) throw new Error("Stripe did not return an account ID");
        const { data, error } = await admin
          .rpc("connect_set_current_developer_account", {
            target_client_id: client.client_id,
            target_developer_user_id: user.id,
            target_stripe_account_id: remote.id,
            target_configuration: {
              dashboard: remote.dashboard || "full",
              defaults: remote.defaults || {},
              requirements: remote.requirements || null,
            },
          })
          .single();
        if (error || !data)
          throw error || new Error("Could not record connected account");
        account = { ...data, ready: false };
      }
      const destination = `${APP_URL}/buy-with-rocket?app=${encodeURIComponent(appId)}&stripe=return`;
      const onboardingUrl = await createStripeHostedOnboardingLink(
        account.stripe_account_id,
        `${destination}&refresh=1`,
        destination,
        "production",
      );
      return json({
        onboarding_url: onboardingUrl,
        merchant_ready: account.ready,
      });
    }

    if (action === "stripe_catalog") {
      const account = await currentAccount(admin, client.client_id, user.id);
      if (!account?.ready)
        return json({ error: "merchant_onboarding_incomplete" }, 409);
      const cursor = body.starting_after;
      if (
        cursor !== undefined &&
        (typeof cursor !== "string" || !/^price_[A-Za-z0-9]+$/.test(cursor))
      )
        return json({ error: "invalid_cursor" }, 400);
      const page = await stripe.prices.list(
        {
          active: true,
          limit: 100,
          expand: ["data.product"],
          ...(cursor ? { starting_after: cursor } : {}),
        },
        { stripeAccount: account.stripe_account_id },
      );
      const { data: mapped, error } = page.data.length
        ? await admin
            .from("connect_products")
            .select("stripe_price_id")
            .eq("developer_account_id", account.id)
            .in(
              "stripe_price_id",
              page.data.map((price) => price.id),
            )
        : { data: [], error: null };
      if (error) throw error;
      const registered = new Set(
        (mapped || []).map((entry) => entry.stripe_price_id),
      );
      return json({
        prices: page.data.flatMap((price) => {
          const eligible = importableStripePrice(price);
          return eligible
            ? [
                {
                  ...eligible,
                  registered: registered.has(eligible.stripe_price_id),
                },
              ]
            : [];
        }),
        next_cursor: page.has_more ? page.data.at(-1)?.id || null : null,
      });
    }

    // The merchant's coding agent calls this with the owner's Rocket session.
    // It records offer semantics without exposing a manual price-mapping UI.
    // A fixed Stripe Price is fetched from the connected account; an inline
    // one-time offer is a fixed server-side snapshot for Checkout price_data.
    if (action === "register_offer") {
      const account = await currentAccount(admin, client.client_id, user.id);
      if (!account?.ready)
        return json({ error: "merchant_onboarding_incomplete" }, 409);
      const offerKey = shortText(body.product_key, 80);
      if (!offerKey || !/^[a-z0-9][a-z0-9_-]{2,80}$/.test(offerKey))
        return json({ error: "invalid_product_key" }, 400);
      const source =
        body.price_source === "inline"
          ? "inline"
          : body.price_source === "stripe_price"
            ? "stripe_price"
            : null;
      if (!source) return json({ error: "invalid_price_source" }, 400);
      let selected: {
        stripe_price_id: string | null;
        stripe_product_id: string | null;
        name: string;
        amount_cents: number;
        currency: "usd";
        billing_type: "one_time" | "subscription";
        interval: "month" | "year" | null;
      };
      if (source === "stripe_price") {
        if (
          typeof body.stripe_price_id !== "string" ||
          !/^price_[A-Za-z0-9]+$/.test(body.stripe_price_id)
        )
          return json({ error: "invalid_price" }, 400);
        const price = await stripe.prices.retrieve(
          body.stripe_price_id,
          { expand: ["product"] },
          { stripeAccount: account.stripe_account_id },
        );
        const imported = importableStripePrice(price);
        if (!imported)
          return json({ error: "stripe_price_not_importable" }, 409);
        selected = imported;
      } else {
        const name = shortText(body.name, 120);
        if (
          !name ||
          !Number.isInteger(body.amount_cents) ||
          body.amount_cents < 100 ||
          body.amount_cents > 100000 ||
          body.currency !== "usd" ||
          body.billing_type !== "one_time" ||
          body.interval != null ||
          body.stripe_price_id != null
        )
          return json({ error: "invalid_inline_offer" }, 400);
        selected = {
          stripe_price_id: null,
          stripe_product_id: null,
          name,
          amount_cents: body.amount_cents,
          currency: "usd",
          billing_type: "one_time",
          interval: null,
        };
      }
      const returnUri = body.payment_return_uri;
      if (!approvedPaymentReturn(returnUri, client.redirect_uris))
        return json({ error: "approved_payment_return_uri_required" }, 400);
      const { data: configuration, error: configurationError } = await admin
        .from("rocket_buy_configuration")
        .select("platform_fee_bps")
        .eq("singleton", true)
        .single();
      if (configurationError) throw configurationError;
      if (configuration.platform_fee_bps !== 500)
        return json({ error: "platform_fee_configuration_invalid" }, 409);
      const { data: existing, error: existingError } = await admin
        .from("connect_products")
        .select(
          "id,developer_account_id,price_source,stripe_price_id,name,amount_cents,currency,billing_type,interval,checkout_return_uris,is_active",
        )
        .eq("client_id", client.client_id)
        .eq("product_key", offerKey)
        .maybeSingle();
      if (existingError) throw existingError;
      if (existing) {
        const same =
          existing.developer_account_id === account.id &&
          existing.price_source === source &&
          existing.stripe_price_id === selected.stripe_price_id &&
          existing.name === selected.name &&
          existing.amount_cents === selected.amount_cents &&
          existing.currency === selected.currency &&
          existing.billing_type === selected.billing_type &&
          existing.interval === selected.interval &&
          existing.checkout_return_uris?.includes(returnUri);
        return same
          ? json({ offer: existing, reused: true })
          : json({ error: "offer_key_conflict" }, 409);
      }
      const { data: saved, error } = await admin
        .from("connect_products")
        .insert({
          id: crypto.randomUUID(),
          client_id: client.client_id,
          developer_account_id: account.id,
          developer_user_id: user.id,
          product_key: offerKey,
          price_source: source,
          ...selected,
          platform_fee_bps: 500,
          is_active: false,
          checkout_return_uris: [returnUri],
        })
        .select(
          "id,product_key,name,amount_cents,currency,interval,billing_type,price_source,is_active",
        )
        .single();
      if (error) throw error;
      return json({ offer: saved, reused: false }, 201);
    }

    if (action === "import_price") {
      const account = await currentAccount(admin, client.client_id, user.id);
      if (!account?.ready)
        return json({ error: "merchant_onboarding_incomplete" }, 409);
      const priceId = body.stripe_price_id;
      if (typeof priceId !== "string" || !/^price_[A-Za-z0-9]+$/.test(priceId))
        return json({ error: "invalid_price" }, 400);
      const accessKey = body.product_key;
      if (
        accessKey !== undefined &&
        (typeof accessKey !== "string" ||
          !/^[a-z0-9][a-z0-9_-]{2,80}$/.test(accessKey))
      )
        return json({ error: "invalid_product_key" }, 400);
      const price = await stripe.prices.retrieve(
        priceId,
        { expand: ["product"] },
        { stripeAccount: account.stripe_account_id },
      );
      const selected = importableStripePrice(price);
      if (!selected || selected.stripe_price_id !== priceId)
        return json({ error: "stripe_price_not_importable" }, 409);
      const returnUri =
        selected.billing_type === "one_time"
          ? body.payment_return_uri
          : APP_URL;
      if (
        selected.billing_type === "one_time" &&
        !approvedPaymentReturn(returnUri, client.redirect_uris)
      )
        return json({ error: "approved_payment_return_uri_required" }, 400);
      const { data: existing, error: existingError } = await admin
        .from("connect_products")
        .select("id")
        .eq("stripe_price_id", priceId)
        .limit(1);
      if (existingError) throw existingError;
      if (existing?.length)
        return json({ error: "stripe_price_already_registered" }, 409);
      const { data: configuration, error: configurationError } = await admin
        .from("rocket_buy_configuration")
        .select("platform_fee_bps")
        .eq("singleton", true)
        .single();
      if (configurationError) throw configurationError;
      if (configuration.platform_fee_bps !== 500)
        return json({ error: "platform_fee_configuration_invalid" }, 409);
      const { data: saved, error } = await admin
        .from("connect_products")
        .insert({
          id: crypto.randomUUID(),
          client_id: client.client_id,
          developer_account_id: account.id,
          developer_user_id: user.id,
          product_key: accessKey || productKey(selected.name),
          ...selected,
          platform_fee_bps: configuration.platform_fee_bps,
          is_active: false,
          checkout_return_uris: [returnUri],
        })
        .select(
          "id,product_key,name,amount_cents,currency,interval,billing_type,platform_fee_bps,is_active",
        )
        .single();
      if (error) throw error;
      return json({ plan: saved }, 201);
    }

    if (action === "create_plan" || action === "create_product") {
      const account = await currentAccount(admin, client.client_id, user.id);
      if (!account?.ready)
        return json({ error: "merchant_onboarding_incomplete" }, 409);
      const name = shortText(body.name, 120);
      const amount = body.amount_cents;
      const kind = body.billing_type ?? "subscription";
      const interval = kind === "one_time" ? null : body.interval;
      if (!["one_time", "subscription"].includes(kind))
        return json({ error: "invalid_billing_type" }, 400);
      const returnUri = kind === "one_time" ? body.payment_return_uri : APP_URL;
      if (
        kind === "one_time" &&
        !approvedPaymentReturn(returnUri, client.redirect_uris)
      )
        return json({ error: "approved_payment_return_uri_required" }, 400);
      if (
        !name ||
        !Number.isInteger(amount) ||
        amount < 100 ||
        amount > 100000 ||
        (kind === "subscription" && !["month", "year"].includes(interval))
      )
        return json({ error: "invalid_plan" }, 400);
      const { data: configuration, error: configurationError } = await admin
        .from("rocket_buy_configuration")
        .select("platform_fee_bps")
        .eq("singleton", true)
        .single();
      if (configurationError) throw configurationError;
      if (configuration.platform_fee_bps !== 500)
        return json({ error: "platform_fee_configuration_invalid" }, 409);
      const canonicalId = crypto.randomUUID();
      const registrationKey = `rocket-product-production-${client.client_id}-${canonicalId}`;
      const product = await stripe.products.create(
        {
          name,
          metadata: {
            rocket_client_id: client.client_id,
            rocket_app_id: appId,
            rocket_developer_user_id: user.id,
            rocket_environment: "production",
            rocket_billing_type: kind,
          },
        },
        {
          stripeAccount: account.stripe_account_id,
          idempotencyKey: registrationKey,
        },
      );
      const price = await stripe.prices.create(
        {
          product: product.id,
          currency: "usd",
          unit_amount: amount,
          ...(kind === "subscription" ? { recurring: { interval } } : {}),
          metadata: {
            rocket_client_id: client.client_id,
            rocket_environment: "production",
          },
        },
        {
          stripeAccount: account.stripe_account_id,
          idempotencyKey: `${registrationKey}-price`,
        },
      );
      if (
        !product.livemode ||
        !priceMatches(
          {
            amount_cents: amount,
            currency: "usd",
            stripe_product_id: product.id,
            billing_type: kind,
            interval,
          },
          price,
          true,
        )
      )
        return json({ error: "stripe_product_mismatch" }, 409);
      const { data: saved, error } = await admin
        .from("connect_products")
        .insert({
          id: canonicalId,
          client_id: client.client_id,
          developer_account_id: account.id,
          developer_user_id: user.id,
          product_key: productKey(name),
          name,
          stripe_product_id: product.id,
          stripe_price_id: price.id,
          amount_cents: amount,
          currency: "usd",
          interval,
          billing_type: kind,
          platform_fee_bps: configuration.platform_fee_bps,
          is_active: false,
          checkout_return_uris: [returnUri],
        })
        .select(
          "id,product_key,name,amount_cents,currency,interval,billing_type,platform_fee_bps,is_active",
        )
        .single();
      if (error) throw error;
      return json({ plan: saved }, 201);
    }

    if (action === "activate_plan") {
      const planId = shortText(body.plan_id, 36);
      if (!planId || !uuid.test(planId))
        return json({ error: "invalid_plan" }, 400);
      const { data: configuration } = await admin
        .from("rocket_buy_configuration")
        .select("live_checkout_enabled")
        .eq("singleton", true)
        .single();
      if (
        !configuration?.live_checkout_enabled ||
        !liveWebhookConfigured(
          Deno.env.get("STRIPE_CONNECT_LIVE_WEBHOOK_SECRET"),
          Deno.env.get("STRIPE_WEBHOOK_SECRET"),
        )
      )
        return json({ error: "live_payments_not_ready" }, 409);
      const account = await currentAccount(admin, client.client_id, user.id);
      if (!account?.ready)
        return json({ error: "merchant_onboarding_incomplete" }, 409);
      const { data: plan, error: planError } = await admin
        .from("connect_products")
        .select("*")
        .eq("id", planId)
        .eq("client_id", client.client_id)
        .eq("developer_account_id", account.id)
        .eq("developer_user_id", user.id)
        .maybeSingle();
      if (planError) throw planError;
      if (!plan) return json({ error: "plan_not_found" }, 404);
      if (!plan.integration_confirmed_at)
        return json({ error: "external_entitlement_test_required" }, 409);
      if (plan.price_source === "stripe_price") {
        const price = await stripe.prices.retrieve(plan.stripe_price_id, {
          stripeAccount: account.stripe_account_id,
        });
        if (!priceMatches(plan, price, true))
          return json({ error: "stripe_plan_mismatch" }, 409);
      } else if (
        plan.price_source !== "inline" ||
        plan.billing_type !== "one_time" ||
        plan.stripe_price_id ||
        plan.stripe_product_id
      ) {
        return json({ error: "inline_plan_mismatch" }, 409);
      }
      const { error } = await admin
        .from("connect_products")
        .update({
          is_active: true,
          activated_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", plan.id)
        .eq("is_active", false);
      if (error) throw error;
      return json({ activated: true });
    }

    return json({ error: "invalid_action" }, 400);
  } catch (error) {
    if (error instanceof StripeConnectV2Error) {
      console.error("rocket-buy-developer Stripe Accounts v2", {
        status: error.status,
        code: error.code,
        requestId: error.requestId,
      });
      return json(
        {
          error: "stripe_account_unavailable",
          stripe_code: error.code || null,
        },
        error.status >= 400 && error.status < 500 ? 400 : 503,
      );
    }
    console.error("rocket-buy-developer", error);
    return json({ error: "developer_payments_unavailable" }, 500);
  }
});
