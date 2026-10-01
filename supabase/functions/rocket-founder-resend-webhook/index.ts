import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { Resend } from "npm:resend@6.30.0";

const PROJECT_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const WEBHOOK_SECRET = Deno.env.get("ROCKET_OUTREACH_RESEND_WEBHOOK_SECRET") ?? "";
const RESEND_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
});

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!PROJECT_URL || !SERVICE_KEY || !WEBHOOK_SECRET || !RESEND_KEY) {
    return json({ error: "Webhook not configured" }, 503);
  }
  const id = req.headers.get("svix-id");
  const timestamp = req.headers.get("svix-timestamp");
  const signature = req.headers.get("svix-signature");
  if (!id || !timestamp || !signature) return json({ error: "Missing signature" }, 401);
  const rawBody = await req.text();
  let event: { type?: string; created_at?: string; data?: { email_id?: string; bounce?: { type?: string }; tags?: Record<string, string> } };
  try {
    const resend = new Resend(RESEND_KEY);
    event = resend.webhooks.verify({
      payload: rawBody,
      headers: { id, timestamp, signature },
      webhookSecret: WEBHOOK_SECRET,
    });
  } catch {
    return json({ error: "Invalid signature" }, 401);
  }
  const eventTypes = new Set(["email.delivered", "email.bounced", "email.complained", "email.opened", "email.clicked"]);
  if (!eventTypes.has(event.type ?? "") || !event.data?.email_id) return json({ ok: true, ignored: true });
  // Resend also emits transient bounces; only permanent bounces suppress.
  if (event.type === "email.bounced" && event.data.bounce?.type !== "Permanent") {
    return json({ ok: true, ignored: true, reason: "non-permanent bounce" });
  }
  const admin = createClient(PROJECT_URL, SERVICE_KEY);
  const { data, error } = await admin.rpc("rocket_outreach_record_resend_event", {
    p_provider_email_id: event.data.email_id,
    p_provider_event_id: id,
    p_event_type: event.type,
    p_occurred_at: event.created_at ?? null,
  });
  if (error) return json({ error: "Event recording failed" }, 500);
  if (data !== true && event.data.tags?.category === "rocket_founder_outreach_test") {
    return json({ error: "Outreach delivery record not ready; retry event" }, 503);
  }
  return json({ ok: true, matched_outreach: data === true });
});
