import Stripe from "npm:stripe@16.12.0";
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const ALLOWED_ORIGINS = ["https://tryrocket.ai", "http://localhost:5173", "http://localhost:3000"];
function cors(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") || "";
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    Vary: "Origin",
  };
}

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const APP_URL = Deno.env.get("APP_URL") || "https://tryrocket.ai";

const PRICES: Record<
  string,
  {
    price?: string;
    mode: "subscription" | "payment";
    trial_days?: number;
    credits?: number;
    product_name: string;
    unit_amount: number;
    interval?: "month" | "year";
  }
> = {
  growth: {
    mode: "subscription",
    trial_days: 7,
    product_name: "Rocket Pro",
    unit_amount: 2000,
    price: "price_1TgpCLL9pkHWyRRuJGdfC77g",
  },
  starter: {
    mode: "subscription",
    trial_days: 7,
    product_name: "Rocket Starter",
    unit_amount: 1200,
  },
  pro: {
    mode: "subscription",
    trial_days: 7,
    product_name: "Rocket Pro",
    unit_amount: 2000,
    price: "price_1TgpCLL9pkHWyRRuJGdfC77g",
  },
  business: {
    mode: "subscription",
    trial_days: 7,
    product_name: "Rocket Business",
    unit_amount: 5000,
  },
  starter_yearly: {
    mode: "subscription",
    trial_days: 7,
    product_name: "Rocket Starter (Yearly)",
    unit_amount: 9900,
    interval: "year",
  },
  growth_yearly: {
    mode: "subscription",
    trial_days: 7,
    product_name: "Rocket Pro (Yearly)",
    unit_amount: 16600,
    interval: "year",
  },
  pro_yearly: {
    mode: "subscription",
    trial_days: 7,
    product_name: "Rocket Pro (Yearly)",
    unit_amount: 16600,
    interval: "year",
  },
  business_yearly: {
    mode: "subscription",
    trial_days: 7,
    product_name: "Rocket Business (Yearly)",
    unit_amount: 41500,
    interval: "year",
  },
  pack_500: { mode: "payment", credits: 500, product_name: "500 Rocket Credits", unit_amount: 500 },
  pack_1500: { mode: "payment", credits: 1500, product_name: "1,500 Rocket Credits", unit_amount: 1000 },
  pack_5000: { mode: "payment", credits: 5000, product_name: "5,000 Rocket Credits", unit_amount: 2500 },
};

Deno.serve(async (req) => {
  const corsHeaders = cors(req);
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders });
  try {
    if (!STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY not configured");
    const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });
    const authHeader = req.headers.get("Authorization");
    if (!authHeader)
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    const user = userData?.user;
    if (!user)
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    const { product } = await req.json();
    const p = PRICES[product];
    if (!p)
      return new Response(JSON.stringify({ error: "invalid_product" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: attempt, error: attemptError } = await admin.rpc("get_active_stripe_checkout_attempt", {
      p_user_id: user.id,
      p_product: product,
    });
    if (attemptError) throw attemptError;
    const checkoutAttempt = Array.isArray(attempt) ? attempt[0] : attempt;
    if (!checkoutAttempt?.idempotency_key) throw new Error("Could not start checkout");

    if (checkoutAttempt.stripe_session_id) {
      const existingSession = await stripe.checkout.sessions.retrieve(checkoutAttempt.stripe_session_id);
      if (existingSession.url) {
        return new Response(JSON.stringify({ url: existingSession.url }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const { data: sub } = await admin
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();
    let customerId = sub?.stripe_customer_id;
    if (!customerId) {
      const c = await stripe.customers.create(
        { email: user.email!, metadata: { user_id: user.id } },
        { idempotencyKey: `rocket-customer-${user.id}` },
      );
      customerId = c.id;
      await admin
        .from("subscriptions")
        .upsert({ user_id: user.id, stripe_customer_id: customerId }, { onConflict: "user_id" });
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: p.mode,
      line_items: [
        p.price
          ? { price: p.price, quantity: 1 }
          : {
              price_data: {
                currency: "usd",
                product_data: { name: p.product_name },
                unit_amount: p.unit_amount,
                ...(p.mode === "subscription" ? { recurring: { interval: p.interval || "month" } } : {}),
              },
              quantity: 1,
            },
      ],
      allow_promotion_codes: true,
      ...(p.mode === "subscription" ? {
        subscription_data: {
          ...(p.trial_days ? { trial_period_days: p.trial_days } : {}),
          metadata: { user_id: user.id, product },
        },
      } : {}),
      success_url: `${APP_URL}/settings/billing?checkout=success`,
      cancel_url: `${APP_URL}/pricing?checkout=canceled`,
      metadata: { user_id: user.id, product, credits: String(p.credits || 0) },
    }, { idempotencyKey: checkoutAttempt.idempotency_key });

    const { error: storeAttemptError } = await admin
      .from("stripe_checkout_attempts")
      .update({ stripe_session_id: session.id })
      .eq("id", checkoutAttempt.id)
      .is("stripe_session_id", null);
    if (storeAttemptError) throw storeAttemptError;

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}); // redeploy
