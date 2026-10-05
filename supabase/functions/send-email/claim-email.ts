// Uses the existing branded layout, EMAIL_FROM and RESEND_API_KEY. All recipient
// and content fields come from a private, transactional DB outbox, not the caller.
type RpcClient = {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: unknown }>;
};
type ClaimEmailJob = {
  id: string;
  recipient: string;
  kind: string;
  context: Record<string, unknown>;
};
type Layout = (data: {
  title: string;
  bodyHtml: string;
  ctaLabel: string;
  ctaUrl: string;
  footer: string;
}) => string;
const escape = (v: unknown) =>
  String(v ?? "—").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&#34;", "'": "&#39;" })[
        c
      ]!,
  );

export function claimEmailContent(kind: string, c: Record<string, unknown>) {
  const admin = kind === "admin_request";
  const title = admin
    ? "Ownership review requested"
    : kind === "received"
      ? "We received your ownership request"
      : kind === "approved"
        ? "Your ownership request was approved"
        : kind === "rejected"
          ? "Your ownership request was not approved"
          : "Your ownership request needs more evidence";
  const rows = [
    ["App", c.app_name],
    ["App URL", c.app_url],
    ["Requested", c.requested_at],
    ["Verification method", c.method],
    [
      "Existing owner conflict",
      c.owner_conflict ? "Yes — approval cannot replace the owner" : "No",
    ],
    [
      "Claim evidence",
      c.evidence_available
        ? "Requester supplied evidence; view it securely in Rocket"
        : "No additional evidence supplied",
    ],
  ];
  if (admin)
    rows.push([
      "Requesting Rocket user",
      `${c.requester_email} (${c.user_id})`,
    ]);
  const notice = admin
    ? "A Rocket login is not proof of ownership. Review the evidence before deciding."
    : kind === "approved"
      ? "Your app is now claimed and appears in Your Apps. Manual approval does not verify control of the domain or bypass developer/payment requirements."
      : kind === "received"
        ? "Your request is queued for manual review. We will email you after a decision. You do not need to submit it again."
        : "Open your claim in Rocket to read the decision or correction details. A rejected request does not grant app ownership.";
  return {
    title,
    bodyHtml: `<p>${notice}</p><table>${rows.map(([k, v]) => `<tr><th style="text-align:left;padding:6px 12px 6px 0">${escape(k)}</th><td>${escape(v)}</td></tr>`).join("")}</table>`,
    ctaLabel: admin ? "Review ownership claim" : "View your claim",
    ctaUrl: admin
      ? `https://tryrocket.ai/admin/ops?claim=${encodeURIComponent(String(c.claim_id))}#claim-${encodeURIComponent(String(c.claim_id))}`
      : "https://tryrocket.ai/your-apps",
    footer:
      "This is a transactional Rocket ownership-verification notification.",
  };
}

export async function deliverClaimEmail(
  db: RpcClient,
  input: { event_id?: string; dispatch_token?: string },
  key: string,
  from: string,
  layout: Layout,
) {
  if (
    !/^[0-9a-f-]{36}$/i.test(input.event_id || "") ||
    !/^[0-9a-f]{64}$/.test(input.dispatch_token || "")
  )
    return { status: 401, body: { error: "Unauthorized" } };
  const args = { p_id: input.event_id, p_token: input.dispatch_token };
  const lease = await db.rpc("lease_claim_email", args);
  if (lease.error) return { status: 503, body: { error: "Queue unavailable" } };
  if (!lease.data)
    return {
      status: 401,
      body: { error: "Unauthorized or already processed" },
    };
  const job = lease.data as ClaimEmailJob;
  try {
    const email = claimEmailContent(job.kind, job.context);
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `rocket-claim/${job.id}`,
      },
      body: JSON.stringify({
        from,
        to: [job.recipient],
        subject: email.title,
        html: layout(email),
      }),
    });
    const result = await response.json();
    if (!response.ok || !result.id)
      throw new Error(`Resend HTTP ${response.status}`);
    const ack = await db.rpc("finish_claim_email", {
      ...args,
      p_resend_id: result.id,
      p_error: null,
    });
    if (ack.error) throw new Error("Queue acknowledgement failed");
    return { status: 200, body: { ok: true } };
  } catch {
    // Do not persist provider response bodies, recipients, secrets or email HTML.
    await db.rpc("finish_claim_email", {
      ...args,
      p_resend_id: null,
      p_error: "Delivery failed; scheduled retry",
    });
    return { status: 503, body: { error: "Delivery queued for retry" } };
  }
}
