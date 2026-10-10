import Stripe from "npm:stripe@16.12.0";
import { createClient } from "npm:@supabase/supabase-js@2.101.1";

const PLATFORM_ACCOUNT_ID = "acct_1TfvwfL9pkHWyRRu";
const origin = "https://tryrocket.ai";
const allowedOrigins = new Set([origin, "https://www.tryrocket.ai", "http://localhost:5173"]);
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type AdType = "featured_app" | "category_sponsor";
const products: Record<AdType, { name: string; amount: number; duration: number }> = {
  featured_app: { name: "Rocket Featured App", amount: 4900, duration: 7 },
  category_sponsor: { name: "Rocket Category Sponsor", amount: 29900, duration: 30 },
};

function reply(req: Request, body: Record<string, unknown>, status = 200) {
  const requestOrigin = req.headers.get("Origin");
  return new Response(JSON.stringify(body), { status, headers: {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": requestOrigin && allowedOrigins.has(requestOrigin) ? requestOrigin : origin,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Cache-Control": "no-store", "Vary": "Origin",
  } });
}

async function verifiedUser(req: Request) {
  const bearer = req.headers.get("Authorization");
  if (!bearer) return null;
  const client = createClient(Deno.env.get("SUPABASE_URL")!, anonKey,
    { global: { headers: { Authorization: bearer } } });
  const { data, error } = await client.auth.getUser();
  return !error ? data.user : null;
}

async function platformStripe(testMode: boolean) {
  const key = Deno.env.get(testMode ? "STRIPE_ADVERTISING_TEST_SECRET_KEY" : "STRIPE_SECRET_KEY");
  if (!key || !key.startsWith(testMode ? "sk_test_" : "sk_live_")) throw new Error("Advertising billing unavailable");
  const stripe = new Stripe(key, { apiVersion: "2024-06-20" });
  const account = await stripe.accounts.retrieve();
  if (account.id !== PLATFORM_ACCOUNT_ID) throw new Error("Rocket billing account mismatch");
  return stripe;
}

async function canonicalPrice(stripe: Stripe, type: AdType, testMode: boolean) {
  const { data: configuration, error } = await admin.from("rocket_sponsorship_prices")
    .select("live_product_id,test_product_id,live_price_id,test_price_id")
    .eq("product_code", type).single();
  if (error || !configuration) throw new Error("Sponsorship price not configured");
  const productId = testMode ? configuration.test_product_id : configuration.live_product_id;
  const priceId = testMode ? configuration.test_price_id : configuration.live_price_id;
  if (!productId || !priceId) throw new Error("Sponsorship price not configured");
  const [product, price] = await Promise.all([
    stripe.products.retrieve(productId), stripe.prices.retrieve(priceId),
  ]);
  if (!product.active || product.name !== products[type].name
    || product.livemode === testMode || product.metadata.rocket_product_type !== type
    || !price.active || price.livemode === testMode
    || (typeof price.product === "string" ? price.product : price.product.id) !== productId
    || price.unit_amount !== products[type].amount || price.currency !== "usd"
    || price.type !== "one_time") throw new Error("Sponsorship catalog mismatch");
  return { productId, priceId };
}

async function releaseExpiredHold(stripe: Stripe, slot: string) {
  const { data: pending, error } = await admin.from("rocket_sponsorships")
    .select("id,stripe_checkout_session_id,hold_expires_at")
    .eq("slot_key", slot).eq("status", "pending").limit(1).maybeSingle();
  if (error) throw error;
  if (!pending || new Date(pending.hold_expires_at).getTime() > Date.now()) return;
  if (pending.stripe_checkout_session_id) {
    const session = await stripe.checkout.sessions.retrieve(pending.stripe_checkout_session_id);
    if (session.status === "open") await stripe.checkout.sessions.expire(session.id);
    else if (session.status !== "expired") throw new Error("Payment confirmation pending");
  }
  const { error: cancelError } = await admin.rpc("cancel_rocket_sponsorship_reservation", { p_id: pending.id });
  if (cancelError) throw cancelError;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return reply(req, { ok: true });
  if (req.method !== "POST") return reply(req, { error: "method_not_allowed" }, 405);
  try {
    const raw = await req.text();
    if (raw.length > 1024) return reply(req, { error: "invalid_request" }, 413);
    const body = JSON.parse(raw);
    if (!body || typeof body !== "object" || Array.isArray(body))
      return reply(req, { error: "invalid_request" }, 400);
    if (body.action === "catalog") {
      const { data, error } = await admin.from("rocket_sponsorship_prices")
        .select("product_code,live_product_id,live_price_id,test_product_id,test_price_id");
      if (error) throw error;
      const billingReady = Boolean(Deno.env.get("ROCKET_ADVERTISING_LIVE_CHECKOUT_ENABLED") === "true"
        && Deno.env.get("STRIPE_SECRET_KEY")?.startsWith("sk_live_")
        && Deno.env.get("STRIPE_WEBHOOK_SECRET"));
      const testReady = Boolean(Deno.env.get("STRIPE_ADVERTISING_TEST_SECRET_KEY")?.startsWith("sk_test_")
        && Deno.env.get("STRIPE_ADVERTISING_TEST_WEBHOOK_SECRET"));
      return reply(req, { products: (data || []).map((row) => ({
        type: row.product_code,
        ready: billingReady && Boolean(row.live_product_id && row.live_price_id),
        test_ready: testReady && Boolean(row.test_product_id && row.test_price_id),
      })) });
    }
    if (body.action === "active") {
      if (body.category != null && (typeof body.category !== "string" || !body.category || body.category.length > 120))
        return reply(req, { error: "invalid_category" }, 400);
      const category = typeof body.category === "string" && body.category.length <= 120
        ? body.category : null;
      const { data: slots, error } = await admin.rpc("active_rocket_sponsorships", { p_category: category });
      if (error) throw error;
      const appIds = [...new Set((slots || []).map((row: { app_id: string }) => row.app_id))];
      const apps = appIds.length ? await admin.from("public_discoverable_apps")
        .select("id,name,slug,tagline,logo_url,categories").in("id", appIds)
        : { data: [], error: null };
      if (apps.error) throw apps.error;
      const byId = new Map((apps.data || []).map((app) => [app.id, app]));
      return reply(req, { placements: (slots || []).flatMap((slot: {
        sponsorship_id: string; sponsorship_type: string; app_id: string; category: string | null;
      }) => byId.has(slot.app_id) ? [{ ...slot, app: byId.get(slot.app_id) }] : []) });
    }
    const user = await verifiedUser(req);
    if (!user) return reply(req, { error: "authentication_required" }, 401);
    if (body.action === "mine") {
      const [ownership, purchases] = await Promise.all([
        admin.from("app_owners").select("app_id").eq("user_id", user.id).is("revoked_at", null),
        admin.from("rocket_sponsorships")
          .select("id,sponsorship_type,target_app_id,target_category,amount_cents,currency,scheduled_start_at,scheduled_end_at,actual_start_at,actual_end_at,status,stripe_payment_status,stripe_livemode,moderation_hold,created_at")
          .eq("purchaser_user_id", user.id).order("created_at", { ascending: false }).limit(50),
      ]);
      if (ownership.error || purchases.error) throw ownership.error || purchases.error;
      const appIds = (ownership.data || []).map((row) => row.app_id);
      const apps = appIds.length
        ? await admin.from("public_discoverable_apps").select("id,name,categories").in("id", appIds)
        : { data: [], error: null };
      if (apps.error) throw apps.error;
      return reply(req, { apps: apps.data || [], sponsorships: (purchases.data || []).map((row) => ({
        ...row, status: row.status === "active" || row.status === "scheduled"
          ? (row.actual_end_at && new Date(row.actual_end_at).getTime() <= Date.now()
            ? "expired" : row.actual_start_at && new Date(row.actual_start_at).getTime() <= Date.now()
              ? "active" : "scheduled")
          : row.status,
      })) });
    }
    const type = body.type as AdType;
    const appId = body.app_id;
    const category = type === "category_sponsor" ? body.category : null;
    if ((type !== "featured_app" && type !== "category_sponsor") || typeof appId !== "string" || !uuid.test(appId)
      || (type === "category_sponsor" && (typeof category !== "string" || category.length > 120))
      || (type === "featured_app" && body.category != null))
      return reply(req, { error: "invalid_sponsorship" }, 400);
    const testMode = body.mode === "test";
    if (testMode) {
      const client = createClient(Deno.env.get("SUPABASE_URL")!, anonKey,
        { global: { headers: { Authorization: req.headers.get("Authorization")! } } });
      const { data: isAdmin, error } = await client.rpc("is_rocket_admin");
      if (error || !isAdmin) return reply(req, { error: "test_checkout_restricted" }, 403);
    } else if (body.mode && body.mode !== "live") return reply(req, { error: "invalid_mode" }, 400);
    if (body.action === "quote") {
      const argumentsForQuote = {
        p_user_id: user.id, p_type: type, p_app_id: appId, p_category: category,
        p_livemode: !testMode,
      };
      let { data, error } = await admin.rpc("quote_rocket_sponsorship", argumentsForQuote);
      if (error) return reply(req, { error: error.message }, 409);
      if (data?.available === false) {
        const slot = `${testMode ? "test" : "live"}:` +
          (type === "featured_app" ? "featured_app" : `category:${category}`);
        const { data: pending, error: pendingError } = await admin.from("rocket_sponsorships")
          .select("hold_expires_at").eq("slot_key", slot).eq("status", "pending").limit(1).maybeSingle();
        if (pendingError) throw pendingError;
        if (pending && new Date(pending.hold_expires_at).getTime() <= Date.now()) {
          await releaseExpiredHold(await platformStripe(testMode), slot);
          ({ data, error } = await admin.rpc("quote_rocket_sponsorship", argumentsForQuote));
          if (error) return reply(req, { error: error.message }, 409);
        }
      }
      return reply(req, { quote: data });
    }
    if (body.action !== "checkout") return reply(req, { error: "invalid_action" }, 400);
    if (!testMode && Deno.env.get("ROCKET_ADVERTISING_LIVE_CHECKOUT_ENABLED") !== "true")
      return reply(req, { error: "Advertising checkout is not yet available" }, 503);
    if (!Deno.env.get(testMode ? "STRIPE_ADVERTISING_TEST_WEBHOOK_SECRET" : "STRIPE_WEBHOOK_SECRET"))
      throw new Error("Advertising payment confirmation unavailable");
    const stripe = await platformStripe(testMode);
    const { priceId } = await canonicalPrice(stripe, type, testMode);
    const slot = `${testMode ? "test" : "live"}:` +
      (type === "featured_app" ? "featured_app" : `category:${category}`);
    await releaseExpiredHold(stripe, slot);
    const { data: booking, error: reserveError } = await admin.rpc("reserve_rocket_sponsorship", {
      p_user_id: user.id, p_type: type, p_app_id: appId,
      p_category: category, p_livemode: !testMode, p_email: user.email || null,
    });
    if (reserveError || !booking) return reply(req, { error: reserveError?.message || "Inventory unavailable" }, 409);
    let session: Stripe.Checkout.Session | null = null;
    try {
      const metadata = { rocket_sponsorship_id: booking.id, rocket_sponsorship_type: type };
      session = await stripe.checkout.sessions.create({
        mode: "payment", payment_method_types: ["card"],
        line_items: [{ price: priceId, quantity: 1 }],
        client_reference_id: booking.id,
        customer_email: user.email || undefined,
        metadata, payment_intent_data: { metadata },
        success_url: `${origin}/advertise?checkout=complete`,
        cancel_url: `${origin}/advertise?checkout=cancelled`,
        expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
      }, { idempotencyKey: `rocket-sponsorship-${booking.id}` });
      if (!session.id || !session.url) throw new Error("Checkout unavailable");
      const { data: saved, error: saveError } = await admin.from("rocket_sponsorships")
        .update({ stripe_checkout_session_id: session.id })
        .eq("id", booking.id).eq("status", "pending")
        .is("stripe_checkout_session_id", null).select("id").single();
      if (saveError || !saved) throw saveError || new Error("Checkout hold unavailable");
      return reply(req, { url: session.url, sponsorship_id: booking.id,
        start: booking.scheduled_start_at, end: booking.scheduled_end_at,
        checkout_expires_at: new Date(session.expires_at * 1000).toISOString() });
    } catch (error) {
      if (session?.id && session.status === "open") {
        try { await stripe.checkout.sessions.expire(session.id); }
        catch { throw new Error("Checkout needs reconciliation before another booking"); }
      }
      await admin.rpc("cancel_rocket_sponsorship_reservation", { p_id: booking.id });
      throw error;
    }
  } catch (error) {
    console.error("rocket-advertising:", error);
    return reply(req, { error: (error as Error).message || "Advertising unavailable" }, 503);
  }
});
