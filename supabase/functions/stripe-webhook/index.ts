// redeploy: 2026-06-12-v11-inline
import Stripe from "npm:stripe@16.12.0";
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

// Keep billing rules in this entrypoint. The Supabase dashboard deploys a
// single function source file and does not include sibling _shared modules.
type PaidPlan = "starter" | "growth" | "business";

const MONTHLY_LIMITS: Record<PaidPlan | "free", number> = {
  free: 500,
  starter: 500,
  growth: 3000,
  business: 15000,
};

function paidPlanFromProduct(product?: string | null): PaidPlan | null {
  const base = product?.replace(/_yearly$/, "");
  if (base === "pro" || base === "growth") return "growth";
  if (base === "starter" || base === "business") return base;
  return null;
}

function paidPlanFromSubscription(sub: {
  metadata?: Record<string, string> | null;
  items: { data: Array<{ price?: { id?: string; unit_amount?: number | null } | null }> };
}): PaidPlan | null {
  const fromMetadata = paidPlanFromProduct(sub.metadata?.product);
  if (fromMetadata) return fromMetadata;

  const amount = sub.items.data[0]?.price?.unit_amount;
  if (amount === 1200 || amount === 9900) return "starter";
  if (amount === 2000 || amount === 16600) return "growth";
  if (amount === 5000 || amount === 41500) return "business";
  return null;
}

function planName(plan: PaidPlan): string {
  return plan === "growth" ? "Pro" : plan[0].toUpperCase() + plan.slice(1);
}

// Stripe's newer subscription event shape places period bounds on items.
// Older events still carry them on the subscription itself.
function subscriptionPeriod(sub: Stripe.Subscription) {
  const item = sub.items.data[0] as Stripe.SubscriptionItem & {
    current_period_start?: number;
    current_period_end?: number;
  } | undefined;
  const legacy = sub as Stripe.Subscription & {
    current_period_start?: number;
    current_period_end?: number;
  };
  const start = item?.current_period_start ?? legacy.current_period_start;
  const end = item?.current_period_end ?? legacy.current_period_end;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end! <= start!) {
    throw new Error("Subscription billing period is unavailable");
  }
  return { start: new Date(start! * 1000).toISOString(), end: new Date(end! * 1000).toISOString() };
}

// ---- Inlined branded email layout (self-contained, no shared imports) ----
// Shared email layout — matches the "Launch" reference design.
// Centered logo, soft outer bg, white card, divider, headline, body, blue CTA, muted footer.

const BRAND = {
  blue: "#167ac6",
  ink: "#167ac6",
  text: "#1F2937",
  muted: "#9CA3AF",
  border: "#E5E7EB",
  bg: "#F4F6FA",
};

const LOGO_URL = "https://tryrocket.ai/rocket-email-logo.png";

function renderEmail({
  preheader,
  title,
  bodyHtml,
  ctaLabel,
  ctaUrl,
  footer = "If you didn't request this email, you can safely ignore it.",
}: {
  preheader?: string;
  title: string;
  bodyHtml: string;
  ctaLabel?: string;
  ctaUrl?: string;
  footer?: string;
}): string {
  const cta = ctaLabel && ctaUrl
    ? `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:24px 0 8px;"><tr><td><a href="${ctaUrl}" style="display:inline-block;background:${BRAND.blue};color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:14px 26px;border-radius:8px;font-family:Inter,Arial,sans-serif;">${ctaLabel}</a></td></tr></table>`
    : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${title}</title></head><body style="margin:0;padding:0;background:${BRAND.bg};font-family:Inter,-apple-system,Segoe UI,Arial,sans-serif;color:${BRAND.text};">${preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${preheader}</div>` : ""}<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:${BRAND.bg};padding:48px 16px;"><tr><td align="center"><table role="presentation" width="560" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;width:100%;background:#ffffff;border:1px solid ${BRAND.border};border-radius:14px;overflow:hidden;"><tr><td align="center" style="padding:36px 32px 28px;"><img src="${LOGO_URL}" alt="Rocket" height="40" style="display:block;border:0;outline:none;text-decoration:none;height:40px;width:auto;"/></td></tr><tr><td style="padding:0 32px;"><div style="border-top:1px solid ${BRAND.border};"></div></td></tr><tr><td style="padding:32px;"><h1 style="margin:0 0 14px;font-size:22px;line-height:1.3;font-weight:700;letter-spacing:-0.01em;color:${BRAND.ink};font-family:Inter,-apple-system,Segoe UI,Arial,sans-serif;">${title}</h1><div style="font-size:15px;line-height:1.65;color:#4B5563;font-family:Inter,-apple-system,Segoe UI,Arial,sans-serif;">${bodyHtml}</div>${cta}</td></tr><tr><td style="padding:0 32px;"><div style="border-top:1px solid ${BRAND.border};"></div></td></tr><tr><td align="center" style="padding:22px 32px 30px;"><div style="font-size:13px;color:${BRAND.muted};font-family:Inter,-apple-system,Segoe UI,Arial,sans-serif;">${footer}</div></td></tr></table><div style="margin-top:18px;font-size:11px;color:${BRAND.muted};font-family:Inter,-apple-system,Segoe UI,Arial,sans-serif;">© Rocket · <a href="https://tryrocket.ai" style="color:${BRAND.muted};text-decoration:none;">tryrocket.ai</a></div></td></tr></table></body></html>`;
}
// ---- End inlined layout ----

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

type Template =
  | "welcome"
  | "rocket_generated"
  | "trial_started"
  | "payment_succeeded"
  | "sponsorship_booked"
  | "credits_purchased"
  | "auth_signup"
  | "auth_magiclink"
  | "auth_recovery"
  | "auth_invite"
  | "auth_email_change"
  | "auth_reauth";
function buildEmail(template: Template, data: any): { subject: string; html: string } {
  switch (template) {
    case "welcome":
      return {
        subject: "Welcome to Rocket 🚀",
        html: renderEmail({
          preheader: "Make your product a brand.",
          title: `Welcome to Rocket${data?.name ? `, ${data.name}` : ""}.`,
          bodyHtml: `<p>You're in. Rocket helps you position, brand, and market your product — drop in a product URL and we'll generate your full brand kit in under 60 seconds.</p><p>You start with <strong>500 free credits</strong>. No card required.</p>`,
          ctaLabel: "Generate your first Brand",
          ctaUrl: "https://tryrocket.ai/create",
        }),
      };
    case "rocket_generated":
      return {
        subject: `Your Brand for ${data?.product_name ?? "your product"} is ready`,
        html: renderEmail({
          preheader: "Your launch kit is ready to review.",
          title: `Your Brand for ${data?.product_name ?? "your product"} is ready.`,
          bodyHtml: `<p>We've generated your complete launch kit — positioning, taglines, social copy, founder bio, Product Hunt assets, directory submissions, and a full launch checklist.</p><p>Review it, tweak anything you want, and ship.</p>`,
          ctaLabel: "Open your Brand",
          ctaUrl: `https://tryrocket.ai/rocket/${data?.rocket_id ?? ""}`,
        }),
      };
    case "trial_started":
      return {
        subject: `Your Rocket ${data?.planName ?? "Pro"} trial has started`,
        html: renderEmail({
          preheader: `7 days of ${data?.planName ?? "Pro"} — on the house.`,
          title: `Your 7-day ${data?.planName ?? "Pro"} trial is live.`,
          bodyHtml: `<p>You now have <strong>${Number(data?.monthlyLimit ?? 3000).toLocaleString("en-US")} credits/month</strong> and the features included with ${data?.planName ?? "Pro"}.</p><p>If you cancel before day 7, you won't be charged.</p>`,
          ctaLabel: "Go to projects",
          ctaUrl: "https://tryrocket.ai/projects",
        }),
      };
    case "payment_succeeded":
      return {
        subject: "Payment received",
        html: renderEmail({
          preheader: `Receipt for $${((data?.amount ?? 0) / 100).toFixed(2)}.`,
          title: "Payment received — thank you.",
          bodyHtml: `<p>We received your payment of <strong>$${((data?.amount ?? 0) / 100).toFixed(2)} ${(data?.currency ?? "usd").toUpperCase()}</strong>.</p><p>You can manage your subscription anytime from Settings.</p>`,
          ctaLabel: "Manage billing",
          ctaUrl: "https://tryrocket.ai/settings",
        }),
      };
    case "sponsorship_booked": {
      const safe = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
      })[character]!);
      const product = data?.type === "category_sponsor" ? "Category Sponsor" : "Featured App";
      return {
        subject: `Your ${product} sponsorship is booked`,
        html: renderEmail({
          preheader: `${product} sponsorship details`,
          title: `Your ${product} sponsorship is booked.`,
          bodyHtml: `<p><strong>App:</strong> ${safe(data?.appName)}</p>${data?.category ? `<p><strong>Category:</strong> ${safe(data.category)}</p>` : ""}<p><strong>Placement:</strong> ${safe(data?.start)} to ${safe(data?.end)}</p><p><strong>Paid:</strong> $${((data?.amount ?? 0) / 100).toFixed(2)} USD, one-time.</p>`,
          ctaLabel: "View My Advertising",
          ctaUrl: "https://tryrocket.ai/advertise",
          footer: "Paid placements are separate from Rocket's organic rankings and editorial picks.",
        }),
      };
    }
    case "credits_purchased":
      return {
        subject: `${data?.credits ?? 0} Rocket Credits added`,
        html: renderEmail({
          preheader: "Your credits are live.",
          title: `${data?.credits ?? 0} credits added to your account.`,
          bodyHtml: `<p>Your credit pack is on your account and ready to use.</p>`,
          ctaLabel: "Generate a Brand",
          ctaUrl: "https://tryrocket.ai/create",
        }),
      };
    case "auth_signup":
      return {
        subject: "Confirm your Rocket account",
        html: renderEmail({
          preheader: "One click to verify your email.",
          title: "Make your product a brand.",
          bodyHtml: `<p>Welcome to Rocket — make your product a brand. Tap the button below to confirm your email and start generating brands.</p>`,
          ctaLabel: "Confirm email",
          ctaUrl: data?.confirmation_url,
        }),
      };
    case "auth_magiclink":
      return {
        subject: "Your Rocket sign-in link",
        html: renderEmail({
          preheader: "Tap to sign in to Rocket.",
          title: "Sign in to Rocket.",
          bodyHtml: `<p>Click the button below to sign in. This link expires shortly and can only be used once.</p>`,
          ctaLabel: "Sign in to Rocket",
          ctaUrl: data?.confirmation_url,
        }),
      };
    case "auth_recovery":
      return {
        subject: "Reset your Rocket password",
        html: renderEmail({
          preheader: "Set a new password for your Rocket account.",
          title: "Reset your password.",
          bodyHtml: `<p>We received a request to reset your Rocket password. Click below to set a new one. If you didn't request this, you can safely ignore this email.</p>`,
          ctaLabel: "Reset password",
          ctaUrl: data?.confirmation_url,
        }),
      };
    case "auth_invite":
      return {
        subject: "You've been invited to Rocket",
        html: renderEmail({
          preheader: "Accept your invite to join Rocket.",
          title: "You're invited to Rocket.",
          bodyHtml: `<p>You've been invited to join Rocket. Click below to accept and set up your account.</p>`,
          ctaLabel: "Accept invite",
          ctaUrl: data?.confirmation_url,
        }),
      };
    case "auth_email_change":
      return {
        subject: "Confirm your new email",
        html: renderEmail({
          preheader: "Verify your new Rocket email address.",
          title: "Confirm your new email address.",
          bodyHtml: `<p>Click below to confirm <strong>${data?.new_email ?? "your new email"}</strong> as the new email on your Rocket account.</p>`,
          ctaLabel: "Confirm new email",
          ctaUrl: data?.confirmation_url,
        }),
      };
    case "auth_reauth":
      return {
        subject: `Your Rocket verification code: ${data?.token ?? ""}`,
        html: renderEmail({
          preheader: "Use this code to verify it's you.",
          title: "Verify it's you.",
          bodyHtml: `<p>Enter this code in Rocket to continue:</p><p style="font-size:28px;font-weight:700;letter-spacing:4px;margin:18px 0;">${data?.token ?? ""}</p><p>If you didn't request this, you can ignore this email.</p>`,
        }),
      };
  }
}
async function sendBranded(
  resendKey: string,
  fromEmail: string,
  to: string,
  template: Template,
  data: any,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  try {
    const { subject, html } = buildEmail(template, data);
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: fromEmail, to: [to], subject, html }),
    });
    const json = await res.json();
    if (!res.ok) return { ok: false, error: JSON.stringify(json) };
    return { ok: true, id: json.id };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET");
const ADVERTISING_TEST_WEBHOOK_SECRET = Deno.env.get("STRIPE_ADVERTISING_TEST_WEBHOOK_SECRET");
const ADVERTISING_TEST_KEY = Deno.env.get("STRIPE_ADVERTISING_TEST_SECRET_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_EMAIL = (Deno.env.get("EMAIL_FROM") || "Rocket <hello@tryrocket.ai>").replace(/^["']+|["']+$/g, "");

// deno-lint-ignore no-explicit-any
async function getEmail(admin: any, userId: string): Promise<string | null> {
  const { data } = await admin.auth.admin.getUserById(userId);
  return data?.user?.email ?? null;
}

async function applyDeveloperSubscription(admin: any, stripe: Stripe, event: Stripe.Event, sub: Stripe.Subscription): Promise<boolean> {
  const { data: configured, error: configError } = await admin.from("rocket_billing_prices")
    .select("stripe_price_id")
    .eq("product_code", "rocket_developer").maybeSingle();
  if (configError) throw configError;
  const priceId = sub.items.data[0]?.price?.id;
  if (!configured || !priceId || priceId !== configured.stripe_price_id) return false;
  if (sub.items.data.length !== 1 || sub.items.data[0].quantity !== 1) {
    throw new Error("Unexpected Rocket Developer subscription items");
  }
  const userId = sub.metadata.rocket_developer_user_id;
  if (!userId) throw new Error("Rocket Developer subscription has no account owner");
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const customer = await stripe.customers.retrieve(customerId);
  if (customer.deleted || customer.metadata.rocket_developer_user_id !== userId) {
    throw new Error("Rocket Developer customer does not match account owner");
  }
  const { error } = await admin.rpc("apply_rocket_developer_subscription_event", {
    p_event_id: event.id,
    p_user_id: userId,
    p_customer_id: customerId,
    p_subscription_id: sub.id,
    p_price_id: priceId,
    p_status: sub.status,
    p_period_end: subscriptionPeriod(sub).end,
    p_cancel_at_period_end: sub.cancel_at_period_end,
    p_event_created_at: new Date(event.created * 1000).toISOString(),
  });
  if (error) throw error;
  return true;
}

const advertisingProducts = {
  featured_app: { name: "Rocket Featured App", amount: 4900 },
  category_sponsor: { name: "Rocket Category Sponsor", amount: 29900 },
} as const;

// Advertising is Rocket-owned Checkout. Handle it before the generic credits
// and subscription branches so it cannot create an entitlement or credit pack.
async function applySponsorshipCheckout(admin: any, stripe: Stripe, event: Stripe.Event, session: Stripe.Checkout.Session) {
  const id = session.metadata?.rocket_sponsorship_id;
  if (!id) return false;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
    throw new Error("Invalid sponsorship reference");
  const { data: booking, error: bookingError } = await admin.from("rocket_sponsorships")
    .select("id,sponsorship_type,purchaser_user_id,purchaser_email,target_app_id,target_category,stripe_checkout_session_id,stripe_livemode,amount_cents,status")
    .eq("id", id).single();
  if (bookingError || !booking) throw bookingError || new Error("Unknown sponsorship");
  const type = booking.sponsorship_type as keyof typeof advertisingProducts;
  const spec = advertisingProducts[type];
  if (!spec || session.mode !== "payment" || session.status !== "complete"
    || session.payment_status !== "paid" || session.livemode !== event.livemode
    || booking.stripe_livemode !== event.livemode
    || booking.stripe_checkout_session_id !== session.id
    || session.client_reference_id !== id
    || session.metadata?.rocket_sponsorship_type !== type
    || session.amount_total !== spec.amount || booking.amount_cents !== spec.amount
    || session.currency !== "usd" || session.amount_subtotal !== spec.amount
    || (session.customer_details?.email && booking.purchaser_email
      && session.customer_details.email.toLowerCase() !== booking.purchaser_email.toLowerCase()))
    throw new Error("Sponsorship Checkout does not match booking");
  const { data: config, error: configError } = await admin.from("rocket_sponsorship_prices")
    .select("live_product_id,test_product_id,live_price_id,test_price_id")
    .eq("product_code", type).single();
  if (configError || !config) throw configError || new Error("Sponsorship catalog unavailable");
  const productId = event.livemode ? config.live_product_id : config.test_product_id;
  const priceId = event.livemode ? config.live_price_id : config.test_price_id;
  if (!productId || !priceId) throw new Error("Sponsorship catalog incomplete");
  const [lineItems, product, price] = await Promise.all([
    stripe.checkout.sessions.listLineItems(session.id, { limit: 2 }),
    stripe.products.retrieve(productId), stripe.prices.retrieve(priceId),
  ]);
  if (lineItems.data.length !== 1 || lineItems.data[0].quantity !== 1
    || lineItems.data[0].price?.id !== priceId
    || lineItems.data[0].amount_total !== spec.amount
    || !product.active || product.name !== spec.name
    || product.metadata.rocket_product_type !== type
    || product.livemode !== event.livemode || !price.active
    || price.livemode !== event.livemode
    || (typeof price.product === "string" ? price.product : price.product.id) !== productId
    || price.type !== "one_time" || price.unit_amount !== spec.amount || price.currency !== "usd")
    throw new Error("Sponsorship Stripe product/price mismatch");
  const intentId = typeof session.payment_intent === "string"
    ? session.payment_intent : session.payment_intent?.id;
  if (!intentId) throw new Error("Missing sponsorship PaymentIntent");
  const intent = await stripe.paymentIntents.retrieve(intentId);
  if (intent.status !== "succeeded" || intent.livemode !== event.livemode
    || intent.amount !== spec.amount || intent.amount_received !== spec.amount
    || intent.currency !== "usd" || intent.metadata.rocket_sponsorship_id !== id)
    throw new Error("Sponsorship payment is not verified");
  const chargeId = typeof intent.latest_charge === "string"
    ? intent.latest_charge : intent.latest_charge?.id;
  if (!chargeId) throw new Error("Missing sponsorship charge");
  const charge = await stripe.charges.retrieve(chargeId);
  if (charge.payment_intent !== intentId || charge.livemode !== event.livemode
    || charge.amount !== spec.amount || charge.currency !== "usd")
    throw new Error("Sponsorship charge mismatch");
  const fullyRefunded = charge.refunded || charge.amount_refunded >= charge.amount;
  const disputed = charge.disputed === true;
  const { data: applied, error } = await admin.rpc("apply_rocket_sponsorship_payment", {
    p_event_id: event.id, p_sponsorship_id: id, p_session_id: session.id,
    p_payment_intent_id: intent.id, p_price_id: priceId,
    p_amount_cents: spec.amount, p_currency: "usd", p_livemode: event.livemode,
    p_paid_at: new Date(event.created * 1000).toISOString(),
    // Suppress activation atomically when a dispute predated checkout delivery.
    p_fully_refunded: fullyRefunded || disputed,
  });
  if (error) throw error;
  if (disputed) {
    const result = await admin.rpc("apply_rocket_sponsorship_dispute", {
      p_event_id: `dispute-at-checkout:${event.id}`, p_payment_intent_id: intentId,
    });
    if (result.error) throw result.error;
  }
  if (applied && !fullyRefunded && !disputed && RESEND_API_KEY && booking.purchaser_email) {
    const [{ data: target }, { data: placed }] = await Promise.all([
      admin.from("public_apps").select("name").eq("id", booking.target_app_id).maybeSingle(),
      admin.from("rocket_sponsorships").select("actual_start_at,actual_end_at")
        .eq("id", id).single(),
    ]);
    await sendBranded(RESEND_API_KEY, FROM_EMAIL, booking.purchaser_email,
      "sponsorship_booked", {
        type, appName: target?.name || "Your app", category: booking.target_category,
        amount: spec.amount,
        start: placed?.actual_start_at ? new Date(placed.actual_start_at).toUTCString() : "See My Advertising",
        end: placed?.actual_end_at ? new Date(placed.actual_end_at).toUTCString() : "See My Advertising",
      });
  }
  return Boolean(applied);
}

Deno.serve(async (req) => {
  const corsHeaders = cors(req);
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders });
  if (!STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET)
    return new Response("stripe not configured", { status: 500, headers: corsHeaders });
  let stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });
  let testAdvertisingSignature = false;
  const sig = req.headers.get("stripe-signature");
  if (!sig) return new Response("missing signature", { status: 400, headers: corsHeaders });
  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig, STRIPE_WEBHOOK_SECRET);
  } catch (e) {
    if (!ADVERTISING_TEST_WEBHOOK_SECRET || !ADVERTISING_TEST_KEY)
      return new Response(`webhook signature failed: ${(e as Error).message}`, { status: 400, headers: corsHeaders });
    try {
      event = await stripe.webhooks.constructEventAsync(body, sig, ADVERTISING_TEST_WEBHOOK_SECRET);
      if (event.livemode || !ADVERTISING_TEST_KEY.startsWith("sk_test_")) throw new Error("Invalid test event");
      stripe = new Stripe(ADVERTISING_TEST_KEY, { apiVersion: "2024-06-20" });
      testAdvertisingSignature = true;
    } catch {
      return new Response("webhook signature failed", { status: 400, headers: corsHeaders });
    }
  }
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // The separate TEST destination is for advertising only. It must never
  // execute Rocket Developer, credit-pack or subscription fulfilment paths.
  if (testAdvertisingSignature && (
    !["checkout.session.completed", "checkout.session.expired", "charge.refunded", "charge.dispute.created"].includes(event.type)
    || (event.type.startsWith("checkout.session.") &&
      !(event.data.object as Stripe.Checkout.Session).metadata?.rocket_sponsorship_id)
  )) return new Response("ignored", { status: 200, headers: corsHeaders });

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const s = event.data.object as Stripe.Checkout.Session;
        if (s.metadata?.rocket_sponsorship_id) {
          if (event.account) throw new Error("Connected-account event cannot book Rocket advertising");
          const account = await stripe.accounts.retrieve();
          if (account.id !== "acct_1TfvwfL9pkHWyRRu") throw new Error("Rocket platform account mismatch");
          await applySponsorshipCheckout(admin, stripe, event, s);
          break;
        }
        if (s.mode === "subscription" && s.subscription) {
          const subscriptionId = typeof s.subscription === "string" ? s.subscription : s.subscription.id;
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          if (await applyDeveloperSubscription(admin, stripe, event, subscription)) break;
        }
        const userId = s.metadata?.user_id;
        const product = s.metadata?.product;
        const credits = parseInt(s.metadata?.credits || "0", 10);
        if (!userId) break;
        const plan = s.mode === "subscription" && product ? paidPlanFromProduct(product) : null;
        if (s.mode === "subscription" && !plan) throw new Error(`Unknown subscription product: ${product}`);
        const monthlyLimit = plan ? MONTHLY_LIMITS[plan] : null;
        const { data: applied, error: fulfillmentError } = await admin.rpc("apply_stripe_checkout_completion", {
          p_user_id: userId,
          p_session_id: s.id,
          p_amount: s.amount_total || 0,
          p_currency: s.currency || "usd",
          p_payment_type: s.mode === "subscription" ? "subscription" : "credit_pack",
          p_credits: credits,
          p_payment_intent_id: typeof s.payment_intent === "string" ? s.payment_intent : null,
          p_customer_id: typeof s.customer === "string" ? s.customer : null,
          p_subscription_id: typeof s.subscription === "string" ? s.subscription : null,
          p_plan: plan,
          p_monthly_limit: monthlyLimit,
        });
        if (fulfillmentError) throw fulfillmentError;
        if (!applied) break;

        if (credits > 0) {
          if (RESEND_API_KEY) {
            const email = await getEmail(admin, userId);
            if (email)
              sendBranded(RESEND_API_KEY, FROM_EMAIL, email, "credits_purchased", { credits }).catch(console.error);
          }
        }
        if (plan) {
          if (RESEND_API_KEY) {
            const email = await getEmail(admin, userId);
            if (email) sendBranded(RESEND_API_KEY, FROM_EMAIL, email, "trial_started", { planName: planName(plan), monthlyLimit: monthlyLimit }).catch(console.error);
          }
        }
        if (s.amount_total && s.amount_total > 0 && RESEND_API_KEY) {
          const email = await getEmail(admin, userId);
          if (email)
            sendBranded(RESEND_API_KEY, FROM_EMAIL, email, "payment_succeeded", {
              amount: s.amount_total,
              currency: s.currency || "usd",
            }).catch(console.error);
        }
        break;
      }
      case "checkout.session.expired": {
        const session = event.data.object as Stripe.Checkout.Session;
        const id = session.metadata?.rocket_sponsorship_id;
        if (!id) break;
        const { data: booking, error } = await admin.from("rocket_sponsorships")
          .select("id,stripe_checkout_session_id,stripe_livemode,stripe_payment_status")
          .eq("id", id).single();
        if (error || !booking || booking.stripe_checkout_session_id !== session.id
          || booking.stripe_livemode !== event.livemode || session.status !== "expired")
          throw error || new Error("Sponsorship expiration mismatch");
        if (booking.stripe_payment_status === "unpaid") {
          const result = await admin.rpc("cancel_rocket_sponsorship_reservation", { p_id: id });
          if (result.error) throw result.error;
        }
        break;
      }
      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        if (!charge.payment_intent || charge.amount_refunded < charge.amount) break;
        const intentId = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent.id;
        const intent = await stripe.paymentIntents.retrieve(intentId);
        const id = intent.metadata.rocket_sponsorship_id;
        if (!id) break;
        const { data: booking, error: bookingError } = await admin.from("rocket_sponsorships")
          .select("id,stripe_payment_intent_id,stripe_livemode,amount_cents")
          .eq("id", id).single();
        if (bookingError || !booking || booking.stripe_payment_intent_id !== intentId
          || booking.stripe_livemode !== event.livemode || booking.amount_cents !== charge.amount)
          throw bookingError || new Error("Sponsorship refund mismatch");
        const result = await admin.rpc("apply_rocket_sponsorship_refund", {
          p_event_id: event.id, p_payment_intent_id: intentId,
        });
        if (result.error) throw result.error;
        break;
      }
      case "charge.dispute.created": {
        const dispute = event.data.object as Stripe.Dispute;
        const chargeId = typeof dispute.charge === "string" ? dispute.charge : dispute.charge?.id;
        if (!chargeId) break;
        const charge = await stripe.charges.retrieve(chargeId);
        const intentId = typeof charge.payment_intent === "string"
          ? charge.payment_intent : charge.payment_intent?.id;
        if (!intentId) break;
        const intent = await stripe.paymentIntents.retrieve(intentId);
        const id = intent.metadata.rocket_sponsorship_id;
        if (!id) break;
        const { data: booking, error: bookingError } = await admin.from("rocket_sponsorships")
          .select("id,stripe_payment_intent_id,stripe_livemode,amount_cents")
          .eq("id", id).single();
        if (bookingError || !booking || booking.stripe_livemode !== event.livemode
          || (booking.stripe_payment_intent_id && booking.stripe_payment_intent_id !== intentId)
          || booking.amount_cents !== charge.amount || !charge.disputed
          || charge.livemode !== event.livemode)
          throw bookingError || new Error("Sponsorship dispute mismatch");
        // If the checkout event is still in flight, its charge check will
        // observe the dispute and suppress activation before any rendering.
        const result = await admin.rpc("apply_rocket_sponsorship_dispute", {
          p_event_id: event.id, p_payment_intent_id: intentId,
        });
        if (result.error) throw result.error;
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        if (await applyDeveloperSubscription(admin, stripe, event, sub)) break;
        const period = subscriptionPeriod(sub);
        const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
        const { data: row } = await admin
          .from("subscriptions")
          .select("user_id,plan,stripe_subscription_id")
          .eq("stripe_customer_id", customerId)
          .maybeSingle();
        if (!row) break;
        if (row.stripe_subscription_id && row.stripe_subscription_id !== sub.id) break;
        if (!row.stripe_subscription_id && !paidPlanFromProduct(sub.metadata.product)) break;
        const selectedPlan = paidPlanFromSubscription(sub) || paidPlanFromProduct(row.plan);
        const plan = sub.status === "active" || sub.status === "trialing" ? (selectedPlan || "free") : "free";
        const { error } = await admin.rpc("apply_stripe_subscription_event", {
          p_event_id: event.id,
          p_event_type: event.type,
          p_user_id: row.user_id,
          p_customer_id: customerId,
          p_subscription_id: sub.id,
          p_price_id: sub.items.data[0]?.price?.id ?? null,
          p_plan: plan,
          p_status: sub.status,
          p_current_period_start: period.start,
          p_current_period_end: period.end,
          p_trial_end: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
          p_cancel_at_period_end: sub.cancel_at_period_end,
          p_event_created_at: new Date(event.created * 1000).toISOString(),
          p_monthly_limit: MONTHLY_LIMITS[plan],
        });
        if (error) throw error;
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        if (await applyDeveloperSubscription(admin, stripe, event, sub)) break;
        const period = subscriptionPeriod(sub);
        const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
        const { data: row } = await admin
          .from("subscriptions")
          .select("user_id,stripe_subscription_id")
          .eq("stripe_customer_id", customerId)
          .maybeSingle();
        if (!row || row.stripe_subscription_id !== sub.id) break;
        const { error } = await admin.rpc("apply_stripe_subscription_event", {
          p_event_id: event.id,
          p_event_type: event.type,
          p_user_id: row.user_id,
          p_customer_id: customerId,
          p_subscription_id: sub.id,
          p_price_id: sub.items.data[0]?.price?.id ?? null,
          p_plan: "free",
          p_status: "canceled",
          p_current_period_start: period.start,
          p_current_period_end: period.end,
          p_trial_end: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
          p_cancel_at_period_end: sub.cancel_at_period_end,
          p_event_created_at: new Date(event.created * 1000).toISOString(),
          p_monthly_limit: MONTHLY_LIMITS.free,
        });
        if (error) throw error;
        break;
      }
      case "invoice.payment_succeeded":
      case "invoice.payment_failed": {
        break;
      }
    }
    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(`webhook handler error: ${(e as Error).message}`, { status: 500, headers: corsHeaders });
  }
});
