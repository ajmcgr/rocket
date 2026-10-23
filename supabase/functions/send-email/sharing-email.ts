type RpcClient = {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: unknown }>;
};
type Job = {
  id: string;
  recipient: string;
  kind: "published" | "claimed" | "recap" | "app_saved" | "app_collected";
  context: Record<string, unknown>;
};
type Layout = (data: {
  title: string;
  preheader?: string;
  bodyHtml: string;
  ctaLabel: string;
  ctaUrl: string;
  footer: string;
}) => string;
const escape = (value: unknown) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&#34;", "'": "&#39;" })[
        char
      ]!,
  );

export function sharingEmailContent(job: Job) {
  const c = job.context;
  if (job.kind === "recap") {
    const month =
      typeof c.month === "string" && /^\d{4}-(0[1-9]|1[0-2])-01$/.test(c.month)
        ? c.month
        : "";
    if (!month) throw new Error("Invalid month in recap email queue");
    const date = new Date(`${month}T00:00:00Z`);
    const label = new Intl.DateTimeFormat("en-US", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(date);
    return {
      title: `Your ${label} Rocket Recap is ready`,
      bodyHtml: `<p>See how people explored your apps on Rocket in ${escape(label)}.</p><p>Your Recap is private until you choose to share it.</p>`,
      ctaLabel: "View my Recap",
      ctaUrl: "https://tryrocket.ai/recap",
      footer:
        "You received this because your apps had eligible Rocket activity during the month.",
    };
  }
  const slug =
    typeof c.app_slug === "string" &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(c.app_slug)
      ? c.app_slug
      : "";
  const subjectName = String(c.app_name || "Your app")
    .replace(/[\r\n]+/g, " ")
    .slice(0, 120);
  const name = escape(subjectName);
  const url = `https://tryrocket.ai/apps/${encodeURIComponent(slug)}`;
  const share = `https://tryrocket.ai/apps/${encodeURIComponent(slug)}?utm_source=rocket&utm_medium=email`;
  if (!slug) throw new Error("Invalid app in email queue");
  if (job.kind === "app_saved" || job.kind === "app_collected") {
    const saved = job.kind === "app_saved";
    const message = saved
      ? `Someone saved ${subjectName} on Rocket.`
      : `Someone added ${subjectName} to a collection on Rocket.`;
    return {
      title: saved
        ? `${subjectName} was saved on Rocket`
        : `${subjectName} was added to a collection`,
      preheader: message,
      bodyHtml: `<p>${escape(message)}</p><p>People are discovering what you've built. Open your app page to see your listing.</p>`,
      text: `${message}\n\nView your app: ${url}\n\nYou received this because you manage this app on Rocket.\nManage app activity emails: https://tryrocket.ai/settings/notifications`,
      ctaLabel: "View my app",
      ctaUrl: url,
      footer: `You received this because you manage this app on Rocket. <a href="https://tryrocket.ai/settings/notifications" style="color:#00598a;">Manage app activity emails</a>`,
    };
  }
  if (job.kind === "published")
    return {
      title: `${subjectName} is now on Rocket`,
      bodyHtml: `<p>Your app is now live on Rocket. People can discover it, save it and explore what you've built.</p><p><a href="${share}" style="color:#00598a;">Share your app</a> · <a href="${url}" style="color:#00598a;">View your listing</a></p><p><img src="https://lcujmvdgczkjxdstzhnr.supabase.co/functions/v1/rocket-share-card?kind=app&amp;id=${encodeURIComponent(slug)}&amp;variant=landscape" alt="${name} share card" width="496" style="display:block;max-width:100%;height:auto;border-radius:12px;" /></p>`,
      ctaLabel: "Share App",
      ctaUrl: share,
      footer: "You received this because you published an app on Rocket.",
    };
  return {
    title: "Your Rocket app claim is complete",
    bodyHtml: `<p>${name} is now connected to your Rocket profile. ${c.verification_level === "domain_verified" ? "Domain control is verified." : "Domain control, traffic and revenue verification are separate checks."}</p>${c.is_public === true ? `<p><a href="${share}" style="color:#00598a;">Share your app</a> · <a href="${url}" style="color:#00598a;">View your listing</a></p>` : "<p>Your listing is not public yet; manage it before sharing.</p>"}`,
    ctaLabel: "Manage app",
    ctaUrl: `https://tryrocket.ai/my-apps`,
    footer: "You received this because your Rocket app claim completed.",
  };
}

export async function deliverSharingEmail(
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
  const lease = await db.rpc("lease_sharing_email", args);
  if (lease.error) return { status: 503, body: { error: "Queue unavailable" } };
  if (!lease.data)
    return {
      status: 401,
      body: { error: "Unauthorized or already processed" },
    };
  const job = lease.data as Job;
  try {
    const email = sharingEmailContent(job);
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `rocket-sharing/${job.id}`,
      },
      body: JSON.stringify({
        from,
        to: [job.recipient],
        subject: email.title,
        html: layout({
          ...email,
          title: escape(email.title),
          ...("preheader" in email
            ? { preheader: escape(email.preheader) }
            : {}),
        }),
        ...("text" in email ? { text: email.text } : {}),
      }),
    });
    const result = await response.json();
    if (!response.ok || !result.id)
      throw new Error(`Resend HTTP ${response.status}`);
    const ack = await db.rpc("finish_sharing_email", {
      ...args,
      p_resend_id: result.id,
      p_error: null,
    });
    if (ack.error) throw new Error("Queue acknowledgement failed");
    return { status: 200, body: { ok: true } };
  } catch {
    await db.rpc("finish_sharing_email", {
      ...args,
      p_resend_id: null,
      p_error: "Delivery failed; scheduled retry",
    });
    return { status: 503, body: { error: "Delivery queued for retry" } };
  }
}
