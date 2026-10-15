import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const PUBLICATION_ID = "pub_393b5dde-3cfb-4905-914e-dfbdb7cfb01e";
const ORIGINS = ["https://tryrocket.ai", "https://www.tryrocket.ai", "https://tryrocket.lovable.app", "http://localhost:5173", "http://localhost:3000"];

function headers(req: Request): HeadersInit {
  const origin = req.headers.get("Origin") || "";
  return {
    "Access-Control-Allow-Origin": ORIGINS.includes(origin) ? origin : ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "Vary": "Origin",
  };
}

function response(req: Request, status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: headers(req) });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: headers(req) });
  if (req.method !== "POST") return response(req, 405, { error: "method_not_allowed" });

  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!jwt) return response(req, 401, { error: "unauthorized" });

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const beehiivKey = Deno.env.get("BEEHIIV_API_KEY");
  if (!url || !serviceKey || !beehiivKey) return response(req, 503, { error: "sync_unavailable" });

  try {
    const admin = createClient(url, serviceKey);
    const { data: auth, error: authError } = await admin.auth.getUser(jwt);
    const user = auth.user;
    if (authError || !user?.id || !user.email) return response(req, 401, { error: "unauthorized" });

    // This flag is set by Rocket's signup UI after displaying the newsletter
    // notice. User metadata is not an authorization source: the JWT already
    // binds this request to this account, and only its verified email is used.
    if (user.user_metadata?.rocket_newsletter_signup_v1 !== true) {
      return response(req, 200, { status: "not_requested" });
    }

    const email = user.email.trim().toLowerCase();
    const provider = user.app_metadata?.provider || "email";
    if (provider === "email") {
      // Rocket's Supabase email provider auto-confirms at account creation.
      // Only the consumed, email-bound Resend token proves inbox ownership.
      const { data: tokens, error: tokenError } = await admin.from("email_verifications")
        .select("email")
        .eq("user_id", user.id)
        .not("used_at", "is", null)
        .order("created_at", { ascending: false })
        .limit(10);
      if (tokenError) throw tokenError;
      if (!tokens?.some((token) => token.email?.trim().toLowerCase() === email)) {
        return response(req, 202, { status: "pending_verification" });
      }
    } else if (!user.email_confirmed_at) {
      return response(req, 202, { status: "pending_verification" });
    }

    // Recover an interrupted attempt, while leaving recent in-flight calls alone.
    const { error: staleError } = await admin.from("beehiiv_account_sync").delete()
      .eq("user_id", user.id).is("accepted_at", null)
      .lt("requested_at", new Date(Date.now() - 5 * 60 * 1000).toISOString());
    if (staleError) throw staleError;

    const { error: reservationError } = await admin.from("beehiiv_account_sync")
      .insert({ user_id: user.id, beehiiv_status: "pending" });
    if (reservationError?.code === "23505") {
      const { data: existing, error: lookupError } = await admin.from("beehiiv_account_sync")
        .select("accepted_at,beehiiv_status")
        .eq("user_id", user.id)
        .single();
      if (lookupError) throw lookupError;
      return response(req, existing.accepted_at ? 200 : 202, {
        status: existing.accepted_at ? "already_accepted" : "pending",
        beehiiv_status: existing.beehiiv_status,
      });
    }
    if (reservationError) throw reservationError;

    try {
      const beehiiv = await fetch(`https://api.beehiiv.com/v2/publications/${PUBLICATION_ID}/subscriptions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${beehiivKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          tags: ["rocket"],
          utm_source: "rocket_account",
          reactivate_existing: false,
          send_welcome_email: false,
        }),
      });
      if (!beehiiv.ok) {
        console.error("[beehiiv-account-sync] Beehiiv rejected request", beehiiv.status);
        return response(req, 502, { error: "beehiiv_rejected" });
      }

      const payload = await beehiiv.json() as { data?: { id?: string; status?: string } };
      const { error: saveError } = await admin.from("beehiiv_account_sync").update({
        subscription_id: payload.data?.id || null,
        beehiiv_status: payload.data?.status || "accepted",
        accepted_at: new Date().toISOString(),
      }).eq("user_id", user.id);
      if (saveError) throw saveError;
      return response(req, 200, { status: "accepted", beehiiv_status: payload.data?.status || null });
    } finally {
      // A rejected or failed call may be retried on the next authenticated load.
      // Keep successful records, including pre-existing unsubscribed recipients.
      await admin.from("beehiiv_account_sync").delete().eq("user_id", user.id).is("accepted_at", null);
    }
  } catch (error) {
    console.error("[beehiiv-account-sync] sync failed", error instanceof Error ? error.message : "unknown");
    return response(req, 503, { error: "sync_failed" });
  }
});
