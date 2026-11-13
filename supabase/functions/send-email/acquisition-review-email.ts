// Recipient and content come only from the private review outbox.
type RpcClient = { rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> };
type Layout = (data: { title: string; bodyHtml: string; ctaLabel: string; ctaUrl: string; footer: string }) => string;
type Job = { id: string; recipient: string; context: Record<string, unknown> };
const escape = (value: unknown) => String(value ?? "—").replace(/[&<>"']/g, character =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&#34;", "'": "&#39;" })[character]!);

export function acquisitionReviewEmailContent(context: Record<string, unknown>) {
  const cents = context.asking_price_cents;
  const price = typeof cents === "number" && Number.isSafeInteger(cents) && cents >= 100
    ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100)
    : "Price on request";
  const rows = [
    ["App", context.app_name],
    ["App URL", context.app_url],
    ["Seller", context.seller_email],
    ["Availability", context.status === "for_sale" ? "For sale" : "Open to offers"],
    ["Asking price", price],
    ["Requested", context.requested_at],
  ];
  return {
    title: "Acquisition listing review requested",
    bodyHtml: `<p>A seller submitted an app acquisition listing for review. Check the listing and seller evidence before deciding. Domain verification does not establish legal ownership.</p><table>${rows.map(([label, value]) => `<tr><th style="text-align:left;padding:6px 12px 6px 0">${escape(label)}</th><td>${escape(value)}</td></tr>`).join("")}</table>`,
    ctaLabel: "Review acquisition listing",
    ctaUrl: "https://tryrocket.ai/admin/ops",
    footer: "This is a transactional Rocket acquisition-review notification.",
  };
}

export async function deliverAcquisitionReviewEmail(
  db: RpcClient,
  input: { event_id?: string; dispatch_token?: string },
  key: string,
  from: string,
  layout: Layout,
) {
  if (!/^[0-9a-f-]{36}$/i.test(input.event_id || "") || !/^[0-9a-f]{64}$/.test(input.dispatch_token || ""))
    return { status: 401, body: { error: "Unauthorized" } };
  const args = { p_id: input.event_id, p_token: input.dispatch_token };
  const lease = await db.rpc("lease_acquisition_review_email", args);
  if (lease.error) return { status: 503, body: { error: "Queue unavailable" } };
  if (!lease.data) return { status: 401, body: { error: "Unauthorized or already processed" } };
  const job = lease.data as Job;
  try {
    const email = acquisitionReviewEmailContent(job.context);
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `rocket-acquisition-review/${job.id}`,
      },
      body: JSON.stringify({ from, to: [job.recipient], subject: email.title, html: layout(email) }),
    });
    const result = await response.json();
    if (!response.ok || !result.id) throw new Error(`Resend HTTP ${response.status}`);
    const ack = await db.rpc("finish_acquisition_review_email", { ...args, p_resend_id: result.id, p_error: null });
    if (ack.error) throw new Error("Queue acknowledgement failed");
    return { status: 200, body: { ok: true } };
  } catch {
    await db.rpc("finish_acquisition_review_email", { ...args, p_resend_id: null, p_error: "Delivery failed; scheduled retry" });
    return { status: 503, body: { error: "Delivery queued for retry" } };
  }
}
