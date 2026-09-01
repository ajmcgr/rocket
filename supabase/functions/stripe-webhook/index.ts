// redeploy: 2026-06-12-v11-inline
import Stripe from "npm:stripe@16.12.0";
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { MONTHLY_LIMITS, paidPlanFromProduct, paidPlanFromSubscription, planName } from "../_shared/billingPlans.ts";

// ---- Inlined branded email layout (self-contained, no shared imports) ----
// Shared email layout — matches the "Launch" reference design.
// Centered logo, soft outer bg, white card, divider, headline, body, blue CTA, muted footer.

const BRAND = {
  blue: "#008BC2",
  ink: "#0A0A0A",
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
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_EMAIL = (Deno.env.get("EMAIL_FROM") || "Rocket <hello@tryrocket.ai>").replace(/^["']+|["']+$/g, "");

// deno-lint-ignore no-explicit-any
async function getEmail(admin: any, userId: string): Promise<string | null> {
  const { data } = await admin.auth.admin.getUserById(userId);
  return data?.user?.email ?? null;
}

Deno.serve(async (req) => {
  const corsHeaders = cors(req);
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders });
  if (!STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET)
    return new Response("stripe not configured", { status: 500, headers: corsHeaders });
  const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });
  const sig = req.headers.get("stripe-signature");
  if (!sig) return new Response("missing signature", { status: 400, headers: corsHeaders });
  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig, STRIPE_WEBHOOK_SECRET);
  } catch (e) {
    return new Response(`webhook signature failed: ${(e as Error).message}`, { status: 400, headers: corsHeaders });
  }
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const s = event.data.object as Stripe.Checkout.Session;
        const userId = s.metadata?.user_id;
        const product = s.metadata?.product;
        const credits = parseInt(s.metadata?.credits || "0", 10);
        if (!userId) break;
        await admin.from("payments").insert({
          user_id: userId,
          amount: s.amount_total || 0,
          currency: s.currency || "usd",
          payment_type: s.mode === "subscription" ? "subscription" : "credit_pack",
          credits_added: credits,
          stripe_session_id: s.id,
          stripe_payment_intent_id: typeof s.payment_intent === "string" ? s.payment_intent : null,
          status: "succeeded",
        });
        if (credits > 0) {
          const { data: u } = await admin
            .from("user_usage")
            .select("credits_extra")
            .eq("user_id", userId)
            .maybeSingle();
          await admin
            .from("user_usage")
            .update({ credits_extra: (u?.credits_extra || 0) + credits })
            .eq("user_id", userId);
          await admin.from("credit_transactions").insert({
            user_id: userId,
            kind: "purchased",
            credits,
            meta: { stripe_session_id: s.id, product },
          });
          if (RESEND_API_KEY) {
            const email = await getEmail(admin, userId);
            if (email)
              sendBranded(RESEND_API_KEY, FROM_EMAIL, email, "credits_purchased", { credits }).catch(console.error);
          }
        }
        if (s.mode === "subscription" && product) {
          const plan = paidPlanFromProduct(product);
          if (!plan) throw new Error(`Unknown subscription product: ${product}`);
          const monthly_limit = MONTHLY_LIMITS[plan];
          await admin.from("subscriptions").upsert(
            {
              user_id: userId,
              stripe_customer_id: typeof s.customer === "string" ? s.customer : null,
              stripe_subscription_id: typeof s.subscription === "string" ? s.subscription : null,
              plan,
              status: "trialing",
            },
            { onConflict: "user_id" },
          );
          await admin.from("user_usage").update({ plan, monthly_limit }).eq("user_id", userId);
          if (RESEND_API_KEY) {
            const email = await getEmail(admin, userId);
            if (email) sendBranded(RESEND_API_KEY, FROM_EMAIL, email, "trial_started", { planName: planName(plan), monthlyLimit: monthly_limit }).catch(console.error);
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
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
        const { data: row } = await admin
          .from("subscriptions")
          .select("user_id,plan")
          .eq("stripe_customer_id", customerId)
          .maybeSingle();
        if (!row) break;
        const selectedPlan = paidPlanFromSubscription(sub) || paidPlanFromProduct(row.plan);
        const plan = sub.status === "active" || sub.status === "trialing" ? (selectedPlan || "free") : "free";
        await admin
          .from("subscriptions")
          .update({
            stripe_subscription_id: sub.id,
            status: sub.status,
            plan,
            current_period_start: new Date(sub.current_period_start * 1000).toISOString(),
            current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
            trial_end: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
            cancel_at_period_end: sub.cancel_at_period_end,
          })
          .eq("user_id", row.user_id);
        await admin
          .from("user_usage")
          .update({
            plan,
            monthly_limit: MONTHLY_LIMITS[plan],
          })
          .eq("user_id", row.user_id);
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
        const { data: row } = await admin
          .from("subscriptions")
          .select("user_id")
          .eq("stripe_customer_id", customerId)
          .maybeSingle();
        if (!row) break;
        await admin.from("subscriptions").update({ status: "canceled", plan: "free" }).eq("user_id", row.user_id);
        await admin.from("user_usage").update({ plan: "free", monthly_limit: 100 }).eq("user_id", row.user_id);
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
