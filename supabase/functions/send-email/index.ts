// redeploy: 2026-06-12-v11-inline
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { deliverClaimEmail } from "./claim-email.ts";

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
    "Vary": "Origin",
  };
}

type Template = "welcome"|"rocket_generated"|"trial_started"|"payment_succeeded"|"credits_purchased"|"auth_signup"|"auth_magiclink"|"auth_recovery"|"auth_invite"|"auth_email_change"|"auth_reauth"|"workspace_invite"|"brand_kit_created"|"brand_kit_downloaded";
function buildEmail(template: Template, data: any): { subject: string; html: string } {
  switch (template) {
    case "welcome": return { subject: "Welcome to Rocket 🚀", html: renderEmail({ preheader: "Discover apps and share what you build.", title: `Welcome to Rocket${data?.name ? `, ${data.name}` : ""}.`, bodyHtml: `<p>Rocket is the open app platform. Discover useful apps, build your developer presence, and grow what you make.</p><p>Start by submitting or claiming your app, or explore what other builders are shipping. Your Rocket account also includes optional Create tools with 500 free credits.</p>`, ctaLabel: "Submit or claim my app", ctaUrl: "https://tryrocket.ai/submit", footer: "You're receiving this because you created a Rocket account." }) };
    case "rocket_generated": return { subject: `Your Brand for ${data?.product_name ?? "your product"} is ready`, html: renderEmail({ preheader: "Your Brand is ready to review.", title: `Your Brand for ${data?.product_name ?? "your product"} is ready.`, bodyHtml: `<p>Open your project to review the generated assets and copy available for your product. You can edit and refine them before sharing.</p>`, ctaLabel: "Open your Brand", ctaUrl: `https://tryrocket.ai/rocket/${data?.rocket_id ?? ""}` }) };
    case "trial_started": return { subject: "Your Rocket Create trial has started", html: renderEmail({ preheader: "Your 7-day Create trial has started.", title: "Your 7-day Create trial is live.", bodyHtml: `<p>You now have the credits and features included with your Create plan.</p><p>If you cancel before day 7, you won't be charged.</p>`, ctaLabel: "Go to projects", ctaUrl: "https://tryrocket.ai/projects" }) };
    case "payment_succeeded": return { subject: "Payment received", html: renderEmail({ preheader: `Receipt for $${((data?.amount ?? 0) / 100).toFixed(2)}.`, title: "Payment received — thank you.", bodyHtml: `<p>We received your payment of <strong>$${((data?.amount ?? 0) / 100).toFixed(2)} ${(data?.currency ?? "usd").toUpperCase()}</strong>.</p><p>You can manage your subscription anytime from Settings.</p>`, ctaLabel: "Manage billing", ctaUrl: "https://tryrocket.ai/settings" }) };
    case "credits_purchased": return { subject: `${data?.credits ?? 0} Rocket Credits added`, html: renderEmail({ preheader: "Your credits are live.", title: `${data?.credits ?? 0} credits added to your account.`, bodyHtml: `<p>Your credit pack is on your account and ready to use.</p>`, ctaLabel: "Generate a Brand", ctaUrl: "https://tryrocket.ai/create" }) };
    case "auth_signup": return { subject: "Confirm your Rocket account", html: renderEmail({ preheader: "One click to verify your email.", title: "Welcome to Rocket.", bodyHtml: `<p>Confirm your email to discover apps, submit or claim what you build, and manage your Rocket profile.</p>`, ctaLabel: "Confirm email", ctaUrl: data?.confirmation_url }) };
    case "auth_magiclink": return { subject: "Your Rocket sign-in link", html: renderEmail({ preheader: "Tap to sign in to Rocket.", title: "Sign in to Rocket.", bodyHtml: `<p>Click the button below to sign in. This link expires shortly and can only be used once.</p>`, ctaLabel: "Sign in to Rocket", ctaUrl: data?.confirmation_url }) };
    case "auth_recovery": return { subject: "Reset your Rocket password", html: renderEmail({ preheader: "Set a new password for your Rocket account.", title: "Reset your password.", bodyHtml: `<p>We received a request to reset your Rocket password. Click below to set a new one. If you didn't request this, you can safely ignore this email.</p>`, ctaLabel: "Reset password", ctaUrl: data?.confirmation_url }) };
    case "auth_invite": return { subject: "You've been invited to Rocket", html: renderEmail({ preheader: "Accept your invite to join Rocket.", title: "You're invited to Rocket.", bodyHtml: `<p>You've been invited to join Rocket. Click below to accept and set up your account.</p>`, ctaLabel: "Accept invite", ctaUrl: data?.confirmation_url }) };
    case "auth_email_change": return { subject: "Confirm your new email", html: renderEmail({ preheader: "Verify your new Rocket email address.", title: "Confirm your new email address.", bodyHtml: `<p>Click below to confirm <strong>${data?.new_email ?? "your new email"}</strong> as the new email on your Rocket account.</p>`, ctaLabel: "Confirm new email", ctaUrl: data?.confirmation_url }) };
    case "auth_reauth": return { subject: `Your Rocket verification code: ${data?.token ?? ""}`, html: renderEmail({ preheader: "Use this code to verify it's you.", title: "Verify it's you.", bodyHtml: `<p>Enter this code in Rocket to continue:</p><p style="font-size:28px;font-weight:700;letter-spacing:4px;margin:18px 0;">${data?.token ?? ""}</p><p>If you didn't request this, you can ignore this email.</p>` }) };
    case "workspace_invite": return { subject: `You've been invited to ${data?.workspace_name || "a Rocket workspace"}`, html: renderEmail({ preheader: `Join ${data?.workspace_name || "the workspace"} on Rocket.`, title: `Join ${data?.workspace_name || "the workspace"} on Rocket.`, bodyHtml: `<p><strong>${data?.inviter || "A teammate"}</strong> invited you to collaborate as <strong>${data?.role || "editor"}</strong>.</p><p>Accept the invite to get access to shared projects, assets, and brand kits.</p>`, ctaLabel: "Accept invitation", ctaUrl: data?.confirmation_url, footer: "If you didn't expect this invitation, you can safely ignore it." }) };
    case "brand_kit_created": return { subject: `Your Brand Kit for ${data?.brand_name || "your brand"} is ready`, html: renderEmail({ preheader: "Your brand kit is ready to build on.", title: `Your Brand Kit for ${data?.brand_name || "your brand"} is ready.`, bodyHtml: `<p>You just created a Brand Kit on Rocket. Add logos, icons, colors, and fonts, then use the Brand Book and Social Icons tools as you build.</p><p>Pro includes Brand Kit ZIP and Brand Book downloads.</p>`, ctaLabel: "Open your Brand Kit", ctaUrl: data?.brand_url || "https://tryrocket.ai/brands", footer: "You're receiving this because you created a Brand Kit on Rocket." }) };
    case "brand_kit_downloaded": return { subject: `Your ${data?.brand_name || "brand"} kit download is ready`, html: renderEmail({ preheader: "Your Brand Kit ZIP has been generated.", title: `Your ${data?.brand_name || "brand"} kit is downloading.`, bodyHtml: `<p>We've packaged the available files from your Brand Kit into a ZIP${typeof data?.file_count === "number" ? ` with <strong>${data.file_count} files</strong>` : ""}.</p><p>If the download didn't start, open your Brand Kit and hit Download again.</p>`, ctaLabel: "Open your Brand Kit", ctaUrl: data?.brand_url || "https://tryrocket.ai/brands", footer: "You're receiving this because you downloaded a Brand Kit on Rocket." }) };
  }
}
async function sendBranded(resendKey: string, fromEmail: string, to: string, template: Template, data: any): Promise<{ ok: boolean; id?: string; error?: string }> {
  try {
    const { subject, html } = buildEmail(template, data);
    const res = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: fromEmail, to: [to], subject, html }) });
    const json = await res.json();
    if (!res.ok) return { ok: false, error: JSON.stringify(json) };
    return { ok: true, id: json.id };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}


const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_EMAIL = (Deno.env.get("EMAIL_FROM") || "Rocket <hello@tryrocket.ai>").replace(/^["']+|["']+$/g, "");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  const corsHeaders = cors(req);
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders });
  try {
    if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY not configured");
    const authHeader = req.headers.get("Authorization");
    const input = await req.json();
    if (input.action === "claim_email") {
      const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const result = await deliverClaimEmail(admin, input, RESEND_API_KEY, FROM_EMAIL, renderEmail);
      return new Response(JSON.stringify(result.body), { status: result.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: userData } = await userClient.auth.getUser();
    const user = userData?.user;
    if (!user?.email) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { template, data, invite_id } = input as { template: Template; data?: any; invite_id?: string };
    let recipient = user.email;
    let emailData = data || {};

    if (template === "workspace_invite") {
      if (!invite_id) {
        return new Response(JSON.stringify({ error: "invite_id is required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const { data: invite, error: inviteError } = await admin
        .from("workspace_invites")
        .select("id,workspace_id,email,role,token,invited_by,accepted_at")
        .eq("id", invite_id)
        .maybeSingle();
      if (inviteError || !invite || invite.accepted_at || invite.invited_by !== user.id) {
        return new Response(JSON.stringify({ error: "invite_not_found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const { data: membership } = await admin
        .from("workspace_members")
        .select("role")
        .eq("workspace_id", invite.workspace_id)
        .eq("user_id", user.id)
        .maybeSingle();
      if (!membership || !["owner", "admin"].includes(membership.role)) {
        return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const { data: workspace } = await admin.from("workspaces").select("name").eq("id", invite.workspace_id).maybeSingle();
      recipient = invite.email;
      emailData = {
        workspace_name: workspace?.name || "a Rocket workspace",
        inviter: user.email,
        role: invite.role,
        confirmation_url: `https://tryrocket.ai/invite/${invite.token}`,
      };
    }

    const result = await sendBranded(RESEND_API_KEY, FROM_EMAIL, recipient, template, emailData);
    if (!result.ok) throw new Error(result.error);
    return new Response(JSON.stringify({ ok: true, id: result.id }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
