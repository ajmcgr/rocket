// Existing Rocket branded Resend layout, reused by transactional mail and founder invitations.
const BRAND = {
  blue: "#167ac6",
  ink: "#000000",
  text: "#1F2937",
  muted: "#9CA3AF",
  border: "#E5E7EB",
  bg: "#F4F6FA",
};

const LOGO_URL = "https://tryrocket.ai/rocket-email-logo.png";

export function renderEmail({
  preheader,
  title,
  bodyHtml,
  ctaLabel,
  ctaUrl,
  afterCtaHtml = "",
  footer = "If you didn't request this email, you can safely ignore it.",
}: {
  preheader?: string;
  title: string;
  bodyHtml: string;
  ctaLabel?: string;
  ctaUrl?: string;
  afterCtaHtml?: string;
  footer?: string;
}): string {
  const cta =
    ctaLabel && ctaUrl
      ? `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:24px 0 8px;"><tr><td><a href="${ctaUrl}" style="display:inline-block;background:${BRAND.blue};color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:14px 26px;border-radius:8px;font-family:Inter,Arial,sans-serif;">${ctaLabel}</a></td></tr></table>`
      : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${title}</title></head><body style="margin:0;padding:0;background:${BRAND.bg};font-family:Inter,-apple-system,Segoe UI,Arial,sans-serif;color:${BRAND.text};">${preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${preheader}</div>` : ""}<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:${BRAND.bg};padding:48px 16px;"><tr><td align="center"><table role="presentation" width="560" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;width:100%;background:#ffffff;border:1px solid ${BRAND.border};border-radius:14px;overflow:hidden;"><tr><td align="center" style="padding:36px 32px 28px;"><img src="${LOGO_URL}" alt="Rocket" height="40" style="display:block;border:0;outline:none;text-decoration:none;height:40px;width:auto;"/></td></tr><tr><td style="padding:0 32px;"><div style="border-top:1px solid ${BRAND.border};"></div></td></tr><tr><td style="padding:32px;"><h1 style="margin:0 0 14px;font-size:22px;line-height:1.3;font-weight:700;letter-spacing:-0.01em;color:${BRAND.ink};font-family:Inter,-apple-system,Segoe UI,Arial,sans-serif;">${title}</h1><div style="font-size:15px;line-height:1.65;color:#4B5563;font-family:Inter,-apple-system,Segoe UI,Arial,sans-serif;">${bodyHtml}</div>${cta}${afterCtaHtml ? `<div style="font-size:15px;line-height:1.65;color:#4B5563;font-family:Inter,-apple-system,Segoe UI,Arial,sans-serif;">${afterCtaHtml}</div>` : ""}</td></tr><tr><td style="padding:0 32px;"><div style="border-top:1px solid ${BRAND.border};"></div></td></tr><tr><td align="center" style="padding:22px 32px 30px;"><div style="font-size:13px;color:${BRAND.muted};font-family:Inter,-apple-system,Segoe UI,Arial,sans-serif;">${footer}</div></td></tr></table><div style="margin-top:18px;font-size:11px;color:${BRAND.muted};font-family:Inter,-apple-system,Segoe UI,Arial,sans-serif;">© Rocket · <a href="https://tryrocket.ai" style="color:#00598a;text-decoration:none;">tryrocket.ai</a></div></td></tr></table></body></html>`;
}
