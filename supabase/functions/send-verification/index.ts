// redeploy: 2026-06-12-v10-branded
// No imports from ../_shared. Requires an authenticated user (JWT in Authorization header).

import { createClient } from "npm:@supabase/supabase-js@2.45.0";

// ---------- CORS ----------
const ALLOWED_ORIGINS = [
  "https://tryrocket.ai",
  "https://www.tryrocket.ai",
  "https://tryrocket.lovable.app",
  "http://localhost:5173",
  "http://localhost:3000",
];
function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") || "";
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

// ---------- Env ----------
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const EMAIL_FROM = (Deno.env.get("EMAIL_FROM") || "Rocket <hello@tryrocket.ai>").replace(/^["']+|["']+$/g, "");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const SITE_URL = (Deno.env.get("SITE_URL") || "https://tryrocket.ai").replace(/\/+$/, "");

// ---------- Helpers ----------
async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function randomToken(): string {
  const raw = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(raw).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function safeReturnPath(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return "/logos";
  try {
    const parsed = new URL(value, SITE_URL);
    return parsed.origin === new URL(SITE_URL).origin
      ? `${parsed.pathname}${parsed.search}${parsed.hash}`
      : "/logos";
  } catch {
    return "/logos";
  }
}

function renderEmail(confirmUrl: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Confirm your Rocket account</title></head><body style="margin:0;padding:0;background:#F4F6FA;font-family:Inter,-apple-system,Segoe UI,Arial,sans-serif;color:#1F2937;"><div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">Confirm your email to start using Rocket.</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#F4F6FA;padding:48px 16px;"><tr><td align="center"><table role="presentation" width="560" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;width:100%;background:#ffffff;border:1px solid #E5E7EB;border-radius:14px;overflow:hidden;"><tr><td align="center" style="padding:36px 32px 28px;"><img src="https://tryrocket.ai/rocket-email-logo.png" alt="Rocket" height="40" style="display:block;border:0;outline:none;text-decoration:none;height:40px;width:auto;"/></td></tr><tr><td style="padding:0 32px;"><div style="border-top:1px solid #E5E7EB;"></div></td></tr><tr><td style="padding:32px;"><h1 style="margin:0 0 14px;font-size:22px;line-height:1.3;font-weight:700;letter-spacing:-0.01em;color:#0A0A0A;">Confirm your email to start using Rocket.</h1><div style="font-size:15px;line-height:1.65;color:#4B5563;">Tap below to confirm your email and start creating brand assets with Rocket.</div><table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:24px 0 8px;"><tr><td><a href="${confirmUrl}" style="display:inline-block;background:#008BC2;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:14px 26px;border-radius:8px;">Confirm email</a></td></tr></table></td></tr><tr><td style="padding:0 32px;"><div style="border-top:1px solid #E5E7EB;"></div></td></tr><tr><td align="center" style="padding:22px 32px 30px;"><div style="font-size:13px;color:#9CA3AF;">You&rsquo;re receiving this because you created a Rocket account.</div></td></tr></table><div style="margin-top:18px;font-size:11px;color:#9CA3AF;">&copy; Rocket &middot; <a href="https://tryrocket.ai" style="color:#9CA3AF;text-decoration:none;">tryrocket.ai</a></div></td></tr></table></body></html>`;
}

Deno.serve(async (req) => {
  const headers = { ...corsHeaders(req), "Content-Type": "application/json" };
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders(req) });

  const log: string[] = [];
  const step = (s: string) => { log.push(s); console.log("[send-verification]", s); };
  const fail = (status: number, error: string, message: string, details: unknown, failingStep: string) => {
    console.error("[send-verification] FAIL", failingStep, error, details);
    return new Response(JSON.stringify({ error, message, details: String(details ?? ""), step: failingStep, log }), { status, headers });
  };

  try {
    step("request_received");

    let requestBody: { next?: unknown } = {};
    if (req.method === "POST") {
      try { requestBody = await req.json(); } catch { /* body is optional */ }
    }
    const next = safeReturnPath(requestBody.next);

    if (!SUPABASE_URL || !SERVICE_ROLE) return fail(500, "missing_env", "Supabase env not configured", "SUPABASE_URL/SERVICE_ROLE_KEY missing", "env_checked");
    if (!RESEND_API_KEY) return fail(500, "missing_env", "Resend API key not configured", "RESEND_API_KEY missing", "env_checked");
    step("env_checked");

    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    if (!jwt) return fail(401, "unauthorized", "Not signed in", "Missing Authorization header", "auth_checked");

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
    const user = userData?.user;
    if (userErr || !user || !user.email) return fail(401, "unauthorized", "Invalid session", userErr?.message || "no user", "auth_checked");
    step("auth_checked");

    // OAuth users don't need this flow.
    const provider = (user.app_metadata as Record<string, unknown> | undefined)?.provider as string | undefined;
    if (provider && provider !== "email") {
      return new Response(JSON.stringify({ ok: true, already_verified: true, provider }), { status: 200, headers });
    }

    // Throttle: at most 3 sends per hour per user.
    const { count } = await admin.from("email_verifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", new Date(Date.now() - 60 * 60 * 1000).toISOString());
    if ((count ?? 0) >= 3) {
      return new Response(JSON.stringify({ ok: true, throttled: true, message: "Too many requests. Try again in an hour." }), { status: 200, headers });
    }

    const token = randomToken();
    const token_hash = await sha256Hex(token);
    const expires_at = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    // DEBUG (temporary): never log full token — length + first 8 chars only.
    console.log("[send-verification] 1_raw_token", "len", token.length, "prefix", token.slice(0, 8));
    console.log("[send-verification] 2_token_hash", "len", token_hash.length, "prefix", token_hash.slice(0, 8));
    step("token_created");

    // Invalidate any previously issued, still-active tokens for this user so
    // only the newest link works. Prevents stale-link confusion.
    const { error: invErr } = await admin
      .from("email_verifications")
      .update({ used_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .is("used_at", null);
    if (invErr) console.warn("[send-verification] invalidate_old_warn", invErr.message);
    step("old_tokens_invalidated");

    const { data: insRow, error: insErr } = await admin.from("email_verifications").insert({
      user_id: user.id,
      email: user.email,
      token_hash,
      expires_at,
    }).select("id").maybeSingle();
    if (insErr) return fail(500, "db_insert_failed", "Could not store verification token", insErr.message, "token_saved");
    console.log("[send-verification] 3_stored_in_db", "verification_id", insRow?.id, "stored_hash_prefix", token_hash.slice(0, 8), "expires_at", expires_at);
    step("token_saved");

    const confirmUrl = `${SITE_URL}/verify-email?token=${token}&uid=${user.id}&next=${encodeURIComponent(next)}`;
    console.log("[send-verification] 4_email_link_token", "len", token.length, "prefix", token.slice(0, 8), "is_raw_token", true);
    const html = renderEmail(confirmUrl);
    step("email_rendered");

    step("resend_started");
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: EMAIL_FROM, to: [user.email], subject: "Confirm your Rocket account", html }),
    });
    const body = await resp.text();
    if (!resp.ok) return fail(502, "resend_send_failed", "Resend rejected the email", `${resp.status}: ${body}`, "resend_completed");
    console.log("[send-verification] email_sent to", user.email);
    step("resend_completed");

    step("response_sent");
    return new Response(JSON.stringify({ ok: true, log }), { status: 200, headers });
  } catch (e) {
    return fail(500, "unhandled_exception", "Unexpected server error", (e as Error).message, "response_sent");
  }
});
