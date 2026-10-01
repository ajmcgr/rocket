import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const PROJECT_URL = Deno.env.get("SUPABASE_URL") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const RESEND_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const TEST_EMAIL = (Deno.env.get("ROCKET_OUTREACH_TEST_EMAIL") ?? "").trim().toLowerCase();
const FROM = "Alex from Rocket <alex@tryrocket.ai>";
const ORIGIN = "https://tryrocket.ai";
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
});
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[char] ?? char);

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!TEST_EMAIL || !RESEND_KEY || !PROJECT_URL || !ANON_KEY || !SERVICE_KEY) {
    return json({ error: "Internal test delivery is not configured" }, 503);
  }
  const jwt = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!jwt) return json({ error: "Unauthorized" }, 401);
  const userClient = createClient(PROJECT_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  const { data: identity, error: authError } = await userClient.auth.getUser(jwt);
  if (authError || !identity.user) return json({ error: "Unauthorized" }, 401);
  const { data: isAdmin, error: adminError } = await userClient.rpc("is_rocket_admin");
  if (adminError || isAdmin !== true) return json({ error: "Forbidden" }, 403);
  let queueId: string;
  try { queueId = (await req.json()).queue_id; } catch { return json({ error: "Invalid request" }, 400); }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(queueId ?? "")) {
    return json({ error: "Invalid queue item" }, 400);
  }
  const admin = createClient(PROJECT_URL, SERVICE_KEY);
  const { data: queue } = await admin.from("rocket_outreach_queue")
    .select("id,app_id,recipient_email,founder_first_name,status")
    .eq("id", queueId).maybeSingle();
  if (!queue || queue.recipient_email?.toLowerCase() !== TEST_EMAIL) {
    return json({ error: "Recipient is not the approved internal test address" }, 403);
  }
  const { data: app } = await admin.from("public_discoverable_apps")
    .select("name").eq("id", queue.app_id).maybeSingle();
  if (!app?.name) return json({ error: "App unavailable" }, 409);
  const { data: invitation, error: invitationError } = await userClient.rpc(
    "rocket_admin_issue_claim_invitation", { p_queue_id: queueId },
  );
  if (invitationError || !invitation) return json({ error: "Invitation not eligible" }, 409);
  const { data: reserved, error: reserveError } = await admin.rpc(
    "rocket_outreach_reserve_test_send",
    { p_queue_id: queueId, p_claim_token: invitation.claim_token },
  );
  if (reserveError || !reserved) return json({ error: "Test delivery gate closed or already attempted" }, 409);
  const appName = String(app.name);
  const firstName = String(queue.founder_first_name || "").trim();
  const greeting = firstName ? `Hi ${firstName},` : "Hi there,";
  const claimUrl = `${ORIGIN}/claim-invitation?token=${encodeURIComponent(invitation.claim_token)}&app=${encodeURIComponent(queue.app_id)}`;
  const unsubscribeUrl = `${ORIGIN}/outreach/unsubscribe?token=${encodeURIComponent(invitation.unsubscribe_token)}`;
  const subject = `You launched ${appName} — now grow it with Rocket`;
  const text = `${greeting}\n\nYou launched ${appName} on Launch.\n\nNow we're building Rocket to help you grow and monetize what you built.\n\nYour app is already on Rocket. Claim it to take control of your profile, add screenshots, share details that build trust, and get discovered by more users.\n\nClaim ${appName}: ${claimUrl}\n\nWe're starting with Launch founders first.\n\nAlex\nFounder, Rocket\n\nStop Rocket founder outreach: ${unsubscribeUrl}`;
  const html = `<div style="font-family:Arial,sans-serif;line-height:1.6;max-width:600px;margin:auto;color:#20252b"><p>${escapeHtml(greeting)}</p><p>You launched ${escapeHtml(appName)} on Launch.</p><p>Now we're building Rocket to help you grow and monetize what you built.</p><p>Your app is already on Rocket. Claim it to take control of your profile, add screenshots, share details that build trust, and get discovered by more users.</p><p><a href="${claimUrl}" style="display:inline-block;padding:12px 18px;background:#167ac6;color:#fff;text-decoration:none;border-radius:8px">Claim ${escapeHtml(appName)}</a></p><p>We're starting with Launch founders first.</p><p>Alex<br>Founder, Rocket</p><hr><p style="font-size:12px"><a href="${unsubscribeUrl}">Stop Rocket founder outreach</a></p></div>`;
  let providerId: string | null = null;
  let providerError: string | null = null;
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json",
        "Idempotency-Key": String(reserved.idempotency_key) },
      body: JSON.stringify({ from: FROM, to: [TEST_EMAIL], subject, text, html,
        tags: [{ name: "category", value: "rocket_founder_outreach_test" }],
        headers: { "List-Unsubscribe": `<${unsubscribeUrl}>` } }),
    });
    const payload = await response.json();
    if (response.ok && typeof payload.id === "string") providerId = payload.id;
    else providerError = `Resend rejected request (${response.status})`;
  } catch { providerError = "Resend request outcome unknown"; }
  const { error: finishError } = await admin.rpc("rocket_outreach_finish_test_send", {
    p_attempt_id: reserved.attempt_id, p_provider_email_id: providerId,
    p_error: providerError,
  });
  if (finishError) return json({ error: "Delivery state needs manual review; do not retry" }, 502);
  if (!providerId) return json({ error: "Test delivery failed; reservation prevents automatic retry" }, 502);
  return json({ ok: true, provider_email_id: providerId, test_only: true });
});
