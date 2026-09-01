// Standalone Resend email verification confirmer.
// Public (no JWT required) — consumes a one-time token from the email link.

import { createClient } from "npm:@supabase/supabase-js@2.45.0";

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
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-verification-token",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Vary": "Origin",
  };
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

function safeReturnPath(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return "/logos";
  try {
    const parsed = new URL(value, "https://tryrocket.ai");
    return parsed.origin === "https://tryrocket.ai"
      ? `${parsed.pathname}${parsed.search}${parsed.hash}`
      : "/logos";
  } catch {
    return "/logos";
  }
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  const headers = { ...corsHeaders(req), "Content-Type": "application/json" };
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders(req) });

  const log: string[] = [];
  const step = (s: string) => { log.push(s); console.log("[verify-email]", s); };
  const fail = (status: number, error: string, message: string, details: unknown, failingStep: string) => {
    console.error("[verify-email] FAIL", failingStep, error, details);
    return new Response(JSON.stringify({ error, message, details: String(details ?? ""), step: failingStep, log }), { status, headers });
  };

  try {
    step("request_received");
    if (!SUPABASE_URL || !SERVICE_ROLE) return fail(500, "missing_env", "Supabase env not configured", "url/key missing", "env_checked");
    step("env_checked");

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const requestUrl = new URL(req.url);
    let requestBody: Record<string, unknown> = {};
    if (req.method === "POST") {
      try { requestBody = await req.json(); } catch { /* body is optional */ }
    }
    const next = safeReturnPath(requestUrl.searchParams.get("next") || requestBody.next);

    // Marks the user verified everywhere (profile, usage row, auth metadata) and returns success.
    const finalize = async (user_id: string, confirmedAt?: string | null) => {
      const verifiedAt = confirmedAt || new Date().toISOString();
      const { error: profErr } = await admin.from("profiles")
        .update({ email_verified: true, email_verified_at: verifiedAt })
        .eq("user_id", user_id);
      if (profErr) console.warn("[verify-email] profile update warn", profErr.message);
      step("profile_updated");

      const { error: usageErr } = await admin.from("user_usage")
        .upsert({ user_id, plan: "free", monthly_limit: 500 }, { onConflict: "user_id" });
      if (usageErr) console.warn("[verify-email] usage upsert warn", usageErr.message);
      step("usage_ensured");

      try {
        await admin.auth.admin.updateUserById(user_id, { email_confirm: true, app_metadata: { email_verified: true } });
      } catch (e) { console.warn("[verify-email] auth confirm warn", (e as Error).message); }

      // Generate a magic link so the (likely signed-out) browser can establish a session
      // and land on the user's original destination without an extra login step.
      let signInUrl: string | null = null;
      try {
        const { data: u } = await admin.auth.admin.getUserById(user_id);
        const email = u?.user?.email;
        if (email) {
          const requestedOrigin = req.headers.get("Origin") || "";
          const origin = ALLOWED_ORIGINS.includes(requestedOrigin) ? requestedOrigin : "https://tryrocket.ai";
          const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent(next)}`;
          const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
            type: "magiclink",
            email,
            options: { redirectTo },
          });
          if (linkErr) console.warn("[verify-email] magiclink warn", linkErr.message);
          else signInUrl = linkData?.properties?.action_link ?? null;
        }
      } catch (e) { console.warn("[verify-email] magiclink exception", (e as Error).message); }

      step("response_sent");
      return new Response(JSON.stringify({ success: true, verified: true, redirectTo: next, signInUrl, user_id, log }), { status: 200, headers });
    };

    // Returns email_confirmed_at for a user id, or null.
    const authConfirmedAt = async (user_id: string): Promise<string | null> => {
      try {
        const { data } = await admin.auth.admin.getUserById(user_id);
        return data?.user?.email_confirmed_at ?? null;
      } catch { return null; }
    };

    // Optional: identify the caller from the Authorization header (sent automatically by supabase.functions.invoke).
    let caller: { id: string; email_confirmed_at?: string | null } | null = null;
    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (jwt) {
      try {
        const { data } = await admin.auth.getUser(jwt);
        if (data?.user) caller = { id: data.user.id, email_confirmed_at: data.user.email_confirmed_at };
      } catch { /* anon key or invalid jwt — ignore */ }
    }

    let token = (requestUrl.searchParams.get("token") || req.headers.get("x-verification-token") || "").trim();
    let uidParam = (requestUrl.searchParams.get("uid") || "").trim();
    token = token || String(requestBody.token || requestBody.verification_token || "").trim();
    uidParam = uidParam || String(requestBody.uid || requestBody.user_id || "").trim();
    if (!token) {
      const referrer = req.headers.get("Referer") || req.headers.get("Referrer") || "";
      try { token = (new URL(referrer).searchParams.get("token") || "").trim(); } catch { /* ignore */ }
    }
    token = token.replace(/[).,>\s]+$/g, "");
    if (!token) {
      // No token but the signed-in caller is already confirmed in Supabase Auth → sync + success.
      if (caller?.email_confirmed_at) {
        step("auth_already_confirmed_no_token");
        return await finalize(caller.id, caller.email_confirmed_at);
      }
      return fail(400, "missing_token", "Verification token is missing", "no token provided", "token_received");
    }
    // DEBUG (temporary): never log full token — length + first 8 chars only.
    console.log("[verify-email] 5_received_token", "len", token.length, "prefix", token.slice(0, 8));
    step("token_received");

    const token_hash = await sha256Hex(token);
    console.log("[verify-email] 6_computed_hash", "len", token_hash.length, "prefix", token_hash.slice(0, 8));

    // Primary lookup: exact token_hash match.
    let { data: rows, error: selErr } = await admin
      .from("email_verifications")
      .select("id, user_id, email, expires_at, used_at")
      .eq("token_hash", token_hash)
      .order("created_at", { ascending: false })
      .limit(1);
    // Secondary lookup: most recent row for this uid (handles email-client URL mangling).
    if (!selErr && !(rows && rows.length) && uidParam) {
      const r = await admin
        .from("email_verifications")
        .select("id, user_id, email, expires_at, used_at")
        .eq("user_id", uidParam)
        .order("created_at", { ascending: false })
        .limit(1);
      if (!r.error && r.data && r.data.length) {
        rows = r.data;
        console.log("[verify-email] 7b_uid_fallback_match", "uid", uidParam);
      }
    }
    if (selErr) return fail(500, "db_select_failed", "Lookup failed", selErr.message, "token_looked_up");
    const row = rows?.[0];
    console.log("[verify-email] 7_db_lookup", "found", !!row, "lookup_hash_prefix", token_hash.slice(0, 8));
    if (!row) {
      // FALLBACK A: signed-in caller → trust the JWT.
      if (caller) {
        const confirmedAt = caller.email_confirmed_at || await authConfirmedAt(caller.id);
        step(confirmedAt ? "auth_confirmed_fallback_no_row" : "signed_in_fallback_no_row");
        return await finalize(caller.id, confirmedAt);
      }
      // FALLBACK B: signed-out but link carries uid → confirm that user.
      // Same trust model as a standard email confirmation link.
      if (uidParam) {
        const confirmedAt = await authConfirmedAt(uidParam);
        step(confirmedAt ? "auth_confirmed_fallback_uid" : "uid_fallback_no_row");
        return await finalize(uidParam, confirmedAt);
      }
      return fail(400, "invalid_token", "This verification link is invalid.", token_hash.slice(0, 12), "token_looked_up");
    }
    step("token_looked_up");

    const expired = new Date(row.expires_at).getTime() < Date.now();
    console.log("[verify-email] expired", expired, "used", !!row.used_at, "expires_at", row.expires_at);
    if (expired) {
      // FALLBACK: link expired but auth says the user is already confirmed → verified.
      const confirmedAt = await authConfirmedAt(row.user_id);
      if (confirmedAt) {
        step("auth_confirmed_fallback_expired");
        return await finalize(row.user_id, confirmedAt);
      }
      return fail(400, "expired_token", "This verification link has expired. Please request a new one.", row.expires_at, "token_validated");
    }

    if (row.used_at) {
      // Idempotent: if auth or the profile already says verified (double-click / re-open), report success.
      const confirmedAt = await authConfirmedAt(row.user_id);
      if (confirmedAt) {
        step("auth_confirmed_fallback_used");
        return await finalize(row.user_id, confirmedAt);
      }
      const { data: prof } = await admin.from("profiles").select("email_verified").eq("user_id", row.user_id).maybeSingle();
      if (prof?.email_verified) {
        step("already_verified");
        return await finalize(row.user_id, null);
      }
      return fail(400, "used_token", "This link has already been used or replaced by a newer email. Please request a new one.", row.used_at, "token_validated");
    }
    const { error: updTokErr } = await admin.from("email_verifications").update({ used_at: new Date().toISOString() }).eq("id", row.id);
    if (updTokErr) return fail(500, "db_update_failed", "Could not mark token used", updTokErr.message, "token_consumed");
    step("token_consumed");

    // Mark profile verified, ensure usage row, confirm in Supabase Auth, respond.
    return await finalize(row.user_id, null);
  } catch (e) {
    return fail(500, "unhandled_exception", "Unexpected server error", (e as Error).message, "response_sent");
  }
});
