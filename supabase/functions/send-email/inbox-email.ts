import type { SupabaseClient } from "npm:@supabase/supabase-js@2.45.0";

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[char] || char);

export async function deliverInboxEmail(
  admin: SupabaseClient,
  input: { event_id?: unknown; dispatch_token?: unknown },
  key: string,
  from: string,
  renderEmail: (options: { preheader: string; title: string; bodyHtml: string; ctaLabel: string; ctaUrl: string; footer: string }) => string,
) {
  const id = input.event_id;
  const token = input.dispatch_token;
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id) ||
    typeof token !== "string" || !/^[0-9a-f]{64}$/i.test(token)) {
    return { status: 400, body: { error: "invalid_dispatch" } };
  }
  const { data: delivery, error } = await admin.rpc("lease_rocket_inbox_email", { p_id: id, p_token: token });
  if (error) return { status: 500, body: { error: "delivery_unavailable" } };
  if (!delivery) return { status: 200, body: { skipped: true } };
  const sender = escapeHtml(String(delivery.sender_name).slice(0, 100));
  const app = escapeHtml(String(delivery.app_name).slice(0, 240));
  const url = `https://tryrocket.ai/inbox?conversation=${encodeURIComponent(String(delivery.conversation_id))}`;
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "Idempotency-Key": `rocket-inbox-${id}` },
      body: JSON.stringify({
        from, to: [delivery.recipient], subject: "New message on Rocket",
        html: renderEmail({
          preheader: "You have a new Rocket message.", title: "New message on Rocket",
          bodyHtml: `<p>You've received a new message from <strong>${sender}</strong> about <strong>${app}</strong>.</p><p>View your conversation on Rocket.</p>`,
          ctaLabel: "View Message", ctaUrl: url,
          footer: "You received this because someone messaged you on Rocket. Manage message emails in Settings.",
        }),
      }),
    });
    const result = await response.json().catch(() => ({}));
    const resendId = response.ok && typeof result.id === "string" ? result.id : null;
    await admin.rpc("finish_rocket_inbox_email", {
      p_id: id, p_token: token, p_resend_id: resendId,
      p_error: resendId ? null : `Resend ${response.status}`,
    });
    return resendId ? { status: 200, body: { sent: true } } : { status: 502, body: { error: "resend_failed" } };
  } catch {
    await admin.rpc("finish_rocket_inbox_email", { p_id: id, p_token: token, p_resend_id: null, p_error: "network_error" });
    return { status: 502, body: { error: "resend_unavailable" } };
  }
}
