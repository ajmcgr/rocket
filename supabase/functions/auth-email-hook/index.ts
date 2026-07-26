// redeploy: 2026-06-12-v11-inline

// ---- Inlined branded email layout (self-contained, no shared imports) ----
// Shared email layout — matches the "Launch" reference design.
// Centered logo, soft outer bg, white card, divider, headline, body, blue CTA, muted footer.

const BRAND = {
  blue: "#1676e3",
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

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const HOOK_SECRET = Deno.env.get("SEND_EMAIL_HOOK_SECRET");
const FROM_EMAIL = (Deno.env.get("EMAIL_FROM") || "Rocket <hello@tryrocket.ai>").replace(/^["']+|["']+$/g, "");

const shell = renderEmail;

function buildEmail(actionType: string, confirmationUrl: string, token: string, newEmail?: string) {
  switch (actionType) {
    case "signup":
      return { subject: "Confirm your Rocket account", html: shell({ preheader: "Confirm your email to start using Rocket.", title: "Confirm your email to start using Rocket.", bodyHtml: `<p>Tap below to confirm your email and start creating brand assets with Rocket.</p>`, ctaLabel: "Confirm email", ctaUrl: confirmationUrl, footer: "You're receiving this because you created a Rocket account." }) };
    case "magiclink":
      return { subject: "Your Rocket sign-in link", html: shell({ preheader: "Tap to sign in to Rocket.", title: "Sign in to Rocket.", bodyHtml: `<p>Click below to sign in. This link expires shortly and can only be used once.</p>`, ctaLabel: "Sign in to Rocket", ctaUrl: confirmationUrl }) };
    case "recovery":
      return { subject: "Reset your Rocket password", html: shell({ preheader: "Set a new password.", title: "Reset your password.", bodyHtml: `<p>We received a request to reset your Rocket password. Click below to set a new one. If you didn't request this, you can ignore this email.</p>`, ctaLabel: "Reset password", ctaUrl: confirmationUrl }) };
    case "invite":
      return { subject: "You've been invited to Rocket", html: shell({ preheader: "Accept your invite.", title: "You're invited to Rocket.", bodyHtml: `<p>You've been invited to join Rocket. Click below to accept and set up your account.</p>`, ctaLabel: "Accept invite", ctaUrl: confirmationUrl }) };
    case "email_change":
      return { subject: "Confirm your new email", html: shell({ preheader: "Verify your new email.", title: "Confirm your new email address.", bodyHtml: `<p>Click below to confirm <strong>${newEmail ?? "your new email"}</strong> as the new email on your Rocket account.</p>`, ctaLabel: "Confirm new email", ctaUrl: confirmationUrl }) };
    case "reauthentication":
      return { subject: `Your Rocket verification code: ${token}`, html: shell({ title: "Verify it's you.", bodyHtml: `<p>Enter this code in Rocket:</p><p style="font-size:28px;font-weight:700;letter-spacing:4px;margin:18px 0;">${token}</p><p>If you didn't request this, you can ignore this email.</p>` }) };
    default:
      return { subject: "Rocket", html: shell({ title: "Rocket", bodyHtml: `<p><a href="${confirmationUrl}">Continue</a></p>` }) };
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  try {
    if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY not configured");
    if (!HOOK_SECRET) throw new Error("SEND_EMAIL_HOOK_SECRET not configured");

    const payload = await req.text();
    const id = req.headers.get("webhook-id") || "";
    const timestamp = req.headers.get("webhook-timestamp") || "";
    const sigHeader = req.headers.get("webhook-signature") || "";
    const secretB64 = HOOK_SECRET.replace(/^v1,whsec_/, "");
    const secretBytes = Uint8Array.from(atob(secretB64), (c) => c.charCodeAt(0));
    const key = await crypto.subtle.importKey("raw", secretBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const toSign = new TextEncoder().encode(`${id}.${timestamp}.${payload}`);
    const sigBuf = await crypto.subtle.sign("HMAC", key, toSign);
    const expected = btoa(String.fromCharCode(...new Uint8Array(sigBuf)));
    const provided = sigHeader.split(" ").map((s) => s.replace(/^v1,/, ""));
    if (!provided.includes(expected)) {
      console.error("Invalid signature");
      return new Response(JSON.stringify({ ok: false, error: "Invalid signature" }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    const data = JSON.parse(payload) as {
      user: { email: string };
      email_data: {
        token: string;
        token_hash: string;
        redirect_to: string;
        email_action_type: string;
        site_url: string;
        new_email?: string;
      };
    };

    const { user, email_data } = data;
    const confirmationUrl = `${email_data.site_url}/auth/v1/verify?token=${email_data.token_hash}&type=${email_data.email_action_type}&redirect_to=${encodeURIComponent(email_data.redirect_to || "")}`;
    const { subject, html } = buildEmail(email_data.email_action_type, confirmationUrl, email_data.token, email_data.new_email);

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM_EMAIL, to: [user.email], subject, html }),
    });
    if (!res.ok) {
      const err = await res.text();
      console.error("Resend error", err);
      // Don't block auth flow if email send fails — log and return 200.
      // Supabase will treat non-2xx as hook failure and reject the signup.
      return new Response(JSON.stringify({ ok: false, error: err }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (e) {
    console.error("auth-email-hook error", e);
    // Always 200 so a transient hook failure doesn't break signup.
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), { status: 200, headers: { "Content-Type": "application/json" } });
  }
});