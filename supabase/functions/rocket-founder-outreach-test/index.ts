import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { claimInvitationEmail } from "./template.ts";

const PROJECT_URL = Deno.env.get("SUPABASE_URL") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const RESEND_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const TEST_EMAIL = (Deno.env.get("ROCKET_OUTREACH_TEST_EMAIL") ?? "").trim().toLowerCase();
const POSTAL_ADDRESS = (Deno.env.get("ROCKET_OUTREACH_POSTAL_ADDRESS") ?? "").trim();
const FROM = "Alex from Rocket <alex@tryrocket.ai>";
const ORIGIN = "https://tryrocket.ai";
const cors = {
  "Access-Control-Allow-Origin": ORIGIN,
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
});


Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!RESEND_KEY || !PROJECT_URL || !ANON_KEY || !SERVICE_KEY || !POSTAL_ADDRESS) {
    return json({ error: "Founder delivery is not configured" }, 503);
  }
  const jwt = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!jwt) return json({ error: "Unauthorized" }, 401);
  const userClient = createClient(PROJECT_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  // The scheduler may hold a valid server credential that differs from this
  // runtime's key. Let PostgREST verify it and its service-only RPC permission;
  // never trust decoded JWT claims or require byte equality with an env value.
  const { data: isScheduler, error: schedulerError } = await userClient.rpc("rocket_outreach_is_scheduler");
  const scheduled = !schedulerError && isScheduler === true;
  if (!scheduled) {
    const { data: identity, error: authError } = await userClient.auth.getUser(jwt);
    if (authError || !identity.user) return json({ error: "Unauthorized" }, 401);
    const { data: isAdmin, error: adminError } = await userClient.rpc("is_rocket_admin");
    if (adminError || isAdmin !== true) return json({ error: "Forbidden" }, 403);
  }
  let queueId: string;
  try { queueId = (await req.json()).queue_id; } catch { return json({ error: "Invalid request" }, 400); }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(queueId ?? "")) {
    return json({ error: "Invalid queue item" }, 400);
  }
  const admin = createClient(PROJECT_URL, SERVICE_KEY);
  const { data: control, error: controlError } = await admin.from("rocket_outreach_control")
    .select("paused,send_mode,production_authorized").eq("id", true).maybeSingle();
  if (controlError || !control) return json({ error: "Campaign control unavailable" }, 503);
  const production = control.send_mode === "production";
  if (scheduled && !production) return json({ error: "Scheduled sending requires production mode" }, 403);
  if (production && (control.paused || !control.production_authorized)) {
    return json({ error: "Production campaign is paused or unauthorized" }, 403);
  }
  if (!production && (control.send_mode !== "test" || !control.paused || !TEST_EMAIL)) {
    return json({ error: "Internal test gate closed" }, 403);
  }
  const { data: queue } = await admin.from("rocket_outreach_queue")
    .select("id,app_id,recipient_email,status,founder_first_name")
    .eq("id", queueId).maybeSingle();
  if (!queue || (!production && queue.recipient_email?.toLowerCase() !== TEST_EMAIL)) {
    return json({ error: "Recipient is not authorized for this mode" }, 403);
  }
  if (production) {
    const { data: review } = await admin.from("rocket_outreach_recipient_reviews")
      .select("status").eq("email", queue.recipient_email.trim().toLowerCase()).maybeSingle();
    if (review?.status !== "eligible") return json({ error: "Recipient eligibility not verified" }, 403);
  }
  const { data: app } = await userClient.from("public_discoverable_apps")
    .select("name,slug").eq("id", queue.app_id).maybeSingle();
  if (!app?.name || !app.slug) return json({ error: "App unavailable" }, 409);
  const { data: invitation, error: invitationError } = await userClient.rpc(
    "rocket_admin_issue_claim_invitation", { p_queue_id: queueId },
  );
  if (invitationError || !invitation) return json({ error: "Invitation not eligible" }, 409);
  const { data: reserved, error: reserveError } = await admin.rpc(
    production ? "rocket_outreach_reserve_production_send" : "rocket_outreach_reserve_test_send",
    { p_queue_id: queueId, p_claim_token: invitation.claim_token },
  );
  if (reserveError || !reserved) return json({ error: "Delivery gate closed or already attempted" }, 409);
  const appName = String(app.name);
  const recipient = String(reserved.recipient_email).trim().toLowerCase();
  const claimUrl = `${ORIGIN}/claim-invitation?token=${encodeURIComponent(invitation.claim_token)}&app=${encodeURIComponent(queue.app_id)}`;
  const listingUrl = `${ORIGIN}/apps/${encodeURIComponent(String(app.slug))}`;
  const unsubscribeUrl = `${ORIGIN}/outreach/unsubscribe?token=${encodeURIComponent(invitation.unsubscribe_token)}`;
  const { subject, text, html } = claimInvitationEmail({
    appName, developerName: queue.founder_first_name,
    claimUrl, listingUrl, unsubscribeUrl, postalAddress: POSTAL_ADDRESS,
  });
  let providerId: string | null = null;
  let providerError: string | null = null;
  const payload = JSON.stringify({ from: FROM, to: [recipient], subject, text, html,
    tags: [{ name: "category", value: production ? "rocket_founder_outreach" : "rocket_founder_outreach_test" }],
    headers: { "List-Unsubscribe": `<${unsubscribeUrl}>` } });
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json",
          "Idempotency-Key": String(reserved.idempotency_key) },
        body: payload, signal: AbortSignal.timeout(10000),
      });
      const result = await response.json().catch(() => ({}));
      if (response.ok && typeof result.id === "string") { providerId = result.id; break; }
      providerError = `Resend rejected request (${response.status})`;
      if (response.status !== 429 && response.status < 500) break;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
    } catch {
      // An uncertain provider outcome must not trigger a second send.
      providerError = "Resend request outcome unknown; manual reconciliation required";
      break;
    }
  }
  const { error: finishError } = await admin.rpc("rocket_outreach_finish_test_send", {
    p_attempt_id: reserved.attempt_id, p_provider_email_id: providerId,
    p_error: providerError,
  });
  if (finishError) return json({ error: "Delivery state needs manual review; do not retry" }, 502);
  if (!providerId) return json({ error: "Delivery failed or is uncertain; reservation prevents duplicate send" }, 502);
  return json({ ok: true, provider_email_id: providerId, test_only: !production });
});
