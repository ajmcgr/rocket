import { useCallback, useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import "./Admin.css";
import { toast } from "@/components/ui/sonner";
import { downloadAdminOverviewCsv } from "@/lib/adminOverviewCsv";
import AdminDeveloperTesting from "@/components/AdminDeveloperTesting";
import AdminMarketplaceOps, { PickCollection } from "@/components/AdminMarketplaceOps";
import AdminSponsorships from "@/components/AdminSponsorships";
import AdminInvestorMetrics from "@/components/AdminInvestorMetrics";
import AdminNewsletter from "@/components/AdminNewsletter";
import AdminRocket100 from "@/components/AdminRocket100";
import AdminAppScreenshots from "@/components/AdminAppScreenshots";

type Section = "home" | "metrics" | "ops" | "marketing" | "screenshots" | "outreach" | "developer-testing";
type Period = "today" | "7d" | "30d" | "all";
type Row = Record<string, unknown>;
const sections: Array<{ id: Section; label: string }> = [
  { id: "home", label: "Overview" }, { id: "metrics", label: "Metrics" },
  { id: "ops", label: "Ops" }, { id: "marketing", label: "Marketing" },
  { id: "screenshots", label: "App screenshots" },
  { id: "outreach", label: "Outreach" },
  { id: "developer-testing", label: "Developer testing" },
];
const adminRpc = supabase.rpc.bind(supabase) as unknown as (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
const rows = (value: unknown): Row[] => Array.isArray(value) ? value as Row[] : [];
const obj = (value: unknown): Row => value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
const statLabels: Record<string, string> = { members: "Total Members", profile_views: "App Page Views", claims: "App Claims", submissions: "App Submissions" };
const label = (name: string) => statLabels[name] ?? name.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const count = (value: unknown) => typeof value === "number" ? value.toLocaleString() : "Not tracked";
const statEmojis: Record<string, string> = {
  indexed: "📚", discoverable: "🧭", claimed: "✅", domain_verified: "🌐",
  traffic_verified: "📈", revenue_verified: "💵", held_ambiguous: "⚠️",
  rocket_id_connected: "🪪", buy_enabled: "🛒", usage_verified: "📊",
  members: "👥", new_members: "🎉", developer_members: "🧑‍💻",
  profile_views: "👀", saves: "🔖", reviews: "⭐", searches: "🔎",
  outbound_clicks: "↗️", submissions: "🚀", claims: "🤝",
  ga4_connections: "📈", revenue_connections: "💳", claim_review: "📋",
  review_reports: "🚩", failed_imports: "⚠️", provider_failures: "🔌",
  site_failures: "🛠️", eligible: "✨", queued: "📬", sent: "📤",
  delivered: "✅", clicked: "👆", verified: "✔️", connected: "🔗",
  bounced: "↩️", suppressed: "🔕", skipped: "⏭️", failed: "⚠️",
  share_actions: "📣", referral_visits: "👣", activated_developers: "⚡",
  referral_registrations: "📝", verified_revenue_connections: "💰",
  verified_analytics_connections: "📡", referred_developers_with_claims: "🏷️",
};
const when = (value: unknown) => typeof value === "string" ? new Date(value).toLocaleString() : "—";
const appUrl = (row: Row) => `/apps/${encodeURIComponent(String(row.slug || row.id))}`;
const outreachStatuses = ["eligible", "queued", "sent", "delivered", "clicked", "claimed", "verified", "connected", "bounced", "suppressed", "skipped", "failed"];

function StatGrid({ data }: { data: Row }) {
  return <div className="rocket-admin-stats">{Object.entries(data).map(([name, value]) =>
    <div className="rocket-admin-stat" key={name}>
      <div className="rocket-admin-stat-header"><span>{label(name)}</span><img src="/rocket-email-logo.png" alt="" aria-hidden="true" /></div>
      <div className={`rocket-admin-stat-figure${typeof value === "number" ? "" : " rocket-admin-stat-figure-untracked"}`}><span aria-hidden="true">{statEmojis[name] || "📊"}</span><strong>{count(value)}</strong></div>
      {name === "outbound_clicks" && <small>Daily-deduplicated · UTC calendar days</small>}
      {name === "searches" && <small>Submitted searches · tracked from 24 Oct 2026</small>}
    </div>)}</div>;
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="rocket-admin-panel"><h2>{title}</h2>{children}</section>;
}

function Empty({ children = "Nothing needs attention here." }: { children?: React.ReactNode }) {
  return <p className="rocket-admin-muted">{children}</p>;
}

export default function Admin() {
  const params = useParams() as { section?: string };
  const [search] = useSearchParams();
  const claimId = /^[0-9a-f-]{36}$/i.test(search.get("claim") || "") ? search.get("claim") : null;
  const section = (sections.some((item) => item.id === params.section) ? params.section : "home") as Section;
  const [period, setPeriod] = useState<Period>(section === "home" ? "all" : "30d");
  const [data, setData] = useState<Row | null>(null);
  const [snapshotLoadedAt, setSnapshotLoadedAt] = useState("");
  const [investor, setInvestor] = useState<Row | null>(null);
  const [today, setToday] = useState<Row[]>([]);
  const [internalTests, setInternalTests] = useState<Row[]>([]);
  const [error, setError] = useState("");
  const [batchResult, setBatchResult] = useState("");
  const [busy, setBusy] = useState(false);
  const [claimFeedback, setClaimFeedback] = useState<{ target: string; message: string; error: boolean } | null>(null);
  const refresh = useCallback(async () => {
    setError(""); setData(null); setInvestor(null); setToday([]); setInternalTests([]);
    const [result, batch, claims, tests, investorResult] = await Promise.all([
      adminRpc("rocket_admin_snapshot", { p_section: section === "developer-testing" ? "home" : section === "screenshots" ? "marketing" : section, p_period: period }),
      section === "outreach" ? adminRpc("rocket_admin_outreach_first_batch", {}) : Promise.resolve(null),
      section === "ops" ? adminRpc("rocket_admin_claims", { p_claim: claimId }) : Promise.resolve(null),
      section === "outreach" ? adminRpc("rocket_admin_outreach_test_candidates", {}) : Promise.resolve(null),
      section === "metrics" ? adminRpc("rocket_admin_investor_metrics", {}) : Promise.resolve(null),
    ]);
    if (result.error) { setError(result.error.message.includes("Admin access denied") ? "Access denied. This workspace is limited to Rocket’s confirmed admin account." : result.error.message); return; }
    if (batch?.error) { setError(batch.error.message); return; }
    if (claims?.error) { setError(claims.error.message); return; }
    if (tests?.error) { setError(tests.error.message); return; }
    if (investorResult?.error) { setError(investorResult.error.message); return; }
    setToday(rows(batch?.data));
    setInternalTests(rows(tests?.data));
    setData({ ...obj(result.data), ...(claims ? { claims: claims.data } : {}) });
    setSnapshotLoadedAt(new Date().toISOString());
    setInvestor(investorResult ? obj(investorResult.data) : null);
  }, [section, period, claimId]);
  useEffect(() => { refresh().catch((cause) => setError((cause as Error).message)); }, [refresh]);
  useEffect(() => {
    if (data && claimId) document.getElementById(`claim-${claimId}`)?.scrollIntoView({ block: "center" });
  }, [data, claimId]);
  const act = async (action: string, target: string | null, reason: string | null = null, payload: Row = {}) => {
    setBusy(true); setError("");
    const claimAction = ["approve_claim", "reject_claim", "request_claim_correction"].includes(action);
    if (claimAction) setClaimFeedback(null);
    try {
      const result = await adminRpc("rocket_admin_action", { p_action: action, p_target: target, p_reason: reason, p_payload: payload });
      if (result.error) throw new Error(result.error.message);
      await refresh();
      if (claimAction && target) {
        const message = action === "approve_claim" ? "Claim approved." : action === "reject_claim" ? "Claim rejected." : "Correction requested.";
        setClaimFeedback({ target, message, error: false });
        toast.success(message);
      }
    } catch (cause) {
      const message = (cause as Error).message;
      setError(message);
      if (claimAction && target) {
        setClaimFeedback({ target, message, error: true });
        toast.error(message);
      }
    } finally { setBusy(false); }
  };
  const sendInternalTest = async (queueId: string) => {
    setBusy(true); setError("");
    try {
      const { error: sendError } = await supabase.functions.invoke("rocket-founder-outreach-test", {
        body: { queue_id: queueId },
      });
      if (sendError) throw sendError;
      await refresh();
    } catch (cause) { setError((cause as Error).message); } finally { setBusy(false); }
  };
  const sendNextBatch = async () => {
    setBusy(true); setError(""); setBatchResult("");
    let accepted = 0;
    try {
      // The server still checks eligibility, suppression, uniqueness and rate limits for each item.
      for (const row of today.slice(0, 10)) {
        const { error: sendError } = await supabase.functions.invoke("rocket-founder-outreach-test", {
          body: { queue_id: String(row.id) },
        });
        if (sendError) throw sendError;
        accepted++;
      }
      setBatchResult(`${accepted} invitation${accepted === 1 ? "" : "s"} accepted by the email provider.`);
      await refresh();
    } catch (cause) {
      setBatchResult(`${accepted} invitation${accepted === 1 ? "" : "s"} accepted before the batch stopped.`);
      await refresh();
      setError((cause as Error).message);
    } finally { setBusy(false); }
  };
  const setOutreachPaused = async (paused: boolean) => {
    setBusy(true); setError("");
    try {
      const result = await adminRpc("rocket_admin_set_outreach_pause", { p_paused: paused });
      if (result.error) throw new Error(result.error.message);
      await refresh();
    } catch (cause) { setError((cause as Error).message); } finally { setBusy(false); }
  };
  const reasonAction = (action: string, id: string, prompt: string) => {
    const reason = window.prompt(prompt);
    if (reason !== null) void act(action, id, reason);
  };
  const picks = rows(data?.picks).filter((row) => row.status === "featured");
  const candidates = rows(data?.candidates);

  return <main className="rocket-admin">
    <header className="rocket-admin-heading"><div><p className="rocket-admin-eyebrow">Rocket operating system</p><h1>{section === "home" ? "Admin overview" : label(section)}</h1><p>Production data, explicit decisions, and auditable changes.</p></div>
      {(section === "home" || section === "metrics") && <div className="rocket-admin-heading-actions"><label>Period <select value={period} onChange={(event) => setPeriod(event.target.value as Period)}><option value="today">Today</option><option value="7d">7 days</option><option value="30d">30 days</option><option value="all">All time</option></select></label>
        {section === "home" && <button type="button" disabled={!data || !!error || data.period !== period || !snapshotLoadedAt} onClick={() => data && downloadAdminOverviewCsv(data, period, snapshotLoadedAt)}>Export CSV</button>}
      </div>}
    </header>
    <nav className="rocket-admin-tabs" aria-label="Admin sections">{sections.map((item) => <Link key={item.id} to={item.id === "home" ? "/admin" : `/admin/${item.id}`} className={section === item.id ? "active" : ""}>{item.label}</Link>)}</nav>
    {data && section === "developer-testing" && <AdminDeveloperTesting />}
    {data && section === "screenshots" && <AdminAppScreenshots />}
    {error && <p className="rocket-admin-error" role="alert">{error}</p>}
    {!data && !error && <div className="rocket-admin-loading" role="status" aria-label="Loading admin data"><div /><div /><div /><div /></div>}
    {data && (section === "home" || section === "metrics") && <>
      {section === "metrics" && <AdminInvestorMetrics data={investor} />}
      <Panel title="Catalogue"><StatGrid data={obj(data.catalogue)} /></Panel>
      <Panel title="People"><StatGrid data={obj(data.users)} /></Panel>
      <Panel title="Discovery"><StatGrid data={obj(data.discovery)} /></Panel>
      <Panel title="Developer growth loop"><StatGrid data={obj(data.growth)} /></Panel>
      <Panel title="Developer funnel"><StatGrid data={obj(data.funnel)} /></Panel>
      <Panel title="Needs attention"><StatGrid data={obj(data.attention)} /></Panel>
      <Panel title="Outreach"><StatGrid data={obj(data.outreach)} /></Panel>
    </>}
    {data && section === "ops" && <>
      <AdminMarketplaceOps />
      <Panel title={`Claims awaiting action · ${rows(data.claims).filter(row => row.status === "review").length} need review`}>
        <p className="rocket-admin-note">Approve or reject each request below. Approval marks an app as claimed, not domain verified, and never replaces an active owner.</p>
        {claimFeedback && !claimFeedback.error && <p role="status" className="rocket-admin-note">{claimFeedback.message}</p>}
        {rows(data.claims).length ? <div className="rocket-admin-list">{rows(data.claims).map(row => <article key={String(row.id)} id={`claim-${row.id}`} className={row.id === claimId ? "rocket-admin-claim-selected" : undefined}>
          <strong>{String(row.app_name)} · {String(row.status)}</strong>
          <p><a href={/^https?:\/\//i.test(String(row.app_url)) ? String(row.app_url) : undefined} target="_blank" rel="noopener noreferrer">{String(row.app_url)}</a></p>
          <p>Requester: {String(row.requester_name || "Rocket user")} · {String(row.requester_email)} · {String(row.user_id)}</p>
          <p>{String(row.method)} · Requested {when(row.created_at)}</p>
          {!!row.owner_conflict && <p className="rocket-admin-warning">An active owner exists. Approval is blocked; investigate the conflict.</p>}
          <p className="rocket-admin-evidence">Evidence: {String(row.evidence || "No additional evidence supplied.")}</p>
          <p>Review note: {String(row.review_reason || "None")}</p>
          {rows(row.decisions).map((decision, index) => <p key={index}>Audit: {String(decision.action)} · {String(decision.admin_user_id)} · {when(decision.created_at)} · {String(decision.reason)}</p>)}
          {rows(row.emails).map((email,index) => <p key={index}>Email {String(email.kind)}: {email.sent_at ? `accepted by Resend ${when(email.sent_at)}` : email.last_error ? String(email.last_error) : "queued"} · attempts {String(email.attempts)}</p>)}
          {claimFeedback && claimFeedback.target === row.id && claimFeedback.error && <p role="alert" className="rocket-admin-error">{claimFeedback.message}</p>}
          {["pending","review"].includes(String(row.status)) && <div className="rocket-admin-actions">
            <button disabled={busy || !!row.owner_conflict || !["manual_review","existing_relationship"].includes(String(row.method))} onClick={() => void act("approve_claim", String(row.id))}>Approve as claimed</button>
            <button disabled={busy} onClick={() => reasonAction("request_claim_correction",String(row.id),"What correction is required? (At least 10 characters.)")}>Request correction</button>
            <button disabled={busy} onClick={() => void act("reject_claim", String(row.id))}>Reject</button>
          </div>}
        </article>)}</div> : <Empty />}
      </Panel>
      <Panel title="Sync runs">{rows(data.sync_jobs).length ? <div className="rocket-admin-list">{rows(data.sync_jobs).map((row) => <article key={String(row.id)}><strong>{String(row.status)} · {when(row.started_at)}</strong><p>{count(row.received_count)} / {count(row.expected_count)} received · {count(row.imported_count)} newly imported · {count(row.ambiguous_count)} ambiguous</p>{Boolean(row.error) && <p className="rocket-admin-warning">{String(row.error)}</p>}</article>)}</div> : <Empty />}</Panel>
      <Panel title="Review reports">{rows(data.reports).length ? <div className="rocket-admin-list">{rows(data.reports).map((row) => <article key={String(row.id)}><strong>{String(row.review_status)} review</strong><p>{String(row.body)}</p><p>Report: {String(row.reason)}</p><div className="rocket-admin-actions"><button disabled={busy} onClick={() => reasonAction("hide_review", String(row.review_id), "Why should this review be hidden?")}>Hide review</button><button disabled={busy} onClick={() => void act("restore_review", String(row.review_id))}>Restore review</button></div></article>)}</div> : <Empty>No review reports.</Empty>}</Panel>
      <Panel title="Provider failures">{rows(data.provider_failures).length ? <div className="rocket-admin-list">{rows(data.provider_failures).map((row) => <article key={String(row.app_id)}><strong>{String(row.provider)} · {String(row.app_id)}</strong><p>{String(row.last_error || "Provider needs attention")}</p><p>Last successful: {when(row.last_successful_sync)}</p></article>)}</div> : <Empty />}</Panel>
      <Panel title="Website health">{rows(data.website_issues).length ? <div className="rocket-admin-list">{rows(data.website_issues).map((row) => <article key={String(row.app_id)}><strong>{String(row.name)} · {String(row.status)}</strong><p>Checked {when(row.checked_at)} · {count(row.consecutive_hard_failures)} consecutive hard failures</p></article>)}</div> : <Empty />}</Panel>
      <Panel title="Recent apps">{rows(data.apps).length ? <div className="rocket-admin-list">{rows(data.apps).map((row) => <article key={String(row.id)}><strong><Link to={appUrl(row)}>{String(row.name)}</Link> · {row.is_public ? "Public" : "Hidden"}</strong><p>{String(row.claim_state)} · {String(row.website_status || "Unchecked")} · {count(row.source_count)} sources</p><div className="rocket-admin-actions"><button disabled={busy || !row.is_public} onClick={() => reasonAction("hide_app", String(row.id), "Objective reason for hiding this unclaimed app?")}>Hide</button><button disabled={busy || !!row.is_public} onClick={() => void act("restore_app", String(row.id))}>Restore</button></div></article>)}</div> : <Empty />}</Panel>
      <Panel title="Recent members">{rows(data.members).length ? <div className="rocket-admin-list">{rows(data.members).map((row) => <article key={String(row.id)}><strong>{String(row.email || "No email")}</strong><p>Joined {when(row.created_at)} · {row.email_confirmed_at ? "Confirmed" : "Unconfirmed"}</p></article>)}</div> : <Empty />}</Panel>
    </>}
    {data && section === "marketing" && <>
      <AdminRocket100 />
      <AdminSponsorships />
      <Panel title="Task collections">{picks.map(row => <div key={String(row.id)} className="mb-4"><strong>{String(row.name)}</strong><PickCollection appId={String(row.app_id)} /></div>)}</Panel>
      <p className="rocket-admin-note">Signals nominate candidates; only a deliberate Feature action creates a Rocket Pick. Private metrics are not used here.</p>
      <Panel title="Our picks">{picks.length ? <div className="rocket-admin-list">{picks.map((row) => <article key={String(row.id)}><strong><Link to={appUrl(row)}>{String(row.name)}</Link> · {String(row.placement)}</strong><p>{String(row.headline || "No editorial headline")}</p><button disabled={busy} onClick={() => void act("unfeature", String(row.app_id))}>Unfeature</button></article>)}</div> : <Empty>No picks yet.</Empty>}</Panel>
      <Panel title="Candidates from public Launch activity">{candidates.length ? <div className="rocket-admin-list">{candidates.map((row) => <article key={String(row.id)}><strong><Link to={appUrl(row)}>{String(row.name)}</Link></strong><p>{String(row.tagline || "No description")} · {Array.isArray(row.categories) ? row.categories.join(", ") : "Uncategorized"}</p><p>Signal: {String(row.signal_type || "New listing")} · public Launch votes: {count(row.net_votes)}</p><div className="rocket-admin-actions"><a href={String(row.website_url)} target="_blank" rel="noopener noreferrer">External app ↗</a><button disabled={busy || picks.some((pick) => pick.app_id === row.id)} onClick={() => { const headline = window.prompt("Optional factual headline for this Rocket Pick:") || ""; void act("feature", String(row.id), null, { placement: "standard", headline }); }}>Feature</button></div></article>)}</div> : <Empty />}</Panel>
      <AdminNewsletter />
    </>}
    {data && section === "outreach" && <>
      <p className="rocket-admin-note">Campaign mode: {String(obj(data.control).send_mode || "unknown")} · {obj(data.control).paused ? "Paused" : "Running"} · production authorization {obj(data.control).production_authorized ? "enabled" : "locked"}. Imported Launch contacts require documented outreach eligibility before any external send.</p>
      <Panel title="Queue status"><StatGrid data={Object.fromEntries(outreachStatuses.map((status) => [status, Number(obj(data.counts)[status] || 0)]))} /><button disabled={busy || Boolean(obj(data.control).paused)} onClick={() => void setOutreachPaused(true)}>Pause outreach</button>{obj(data.control).send_mode === "production" && <button disabled={busy || !obj(data.control).paused || !obj(data.control).production_authorized} onClick={() => void setOutreachPaused(false)}>Resume outreach</button>}</Panel>
      <Panel title="Internal acceptance test"><p className="rocket-admin-muted">Only explicitly allowlisted internal recipients can receive a test message while production sending is locked.</p>{internalTests.length ? <div className="rocket-admin-list">{internalTests.map((row) => <article key={String(row.id)}><strong>{String(row.app_name)}</strong><p>{String(row.recipient_email)} · Launch source {String(row.launch_product_id)}</p><button disabled={busy} onClick={() => void sendInternalTest(String(row.id))}>Send internal test invitation</button></article>)}</div> : <Empty>No internal test candidate is available.</Empty>}</Panel>
      <Panel title="First eligible batch"><p className="rocket-admin-muted">Up to 100 distinct reviewed recipients are shown. Each send is checked again by the server; a batch sends at most 10 and stops on the first failure.</p><button disabled={busy || !today.length || Boolean(obj(data.control).paused) || obj(data.control).send_mode !== "production" || !obj(data.control).production_authorized} onClick={() => void sendNextBatch()}>Send next eligible batch (up to 10)</button>{batchResult && <p role="status">{batchResult}</p>}{today.length ? <div className="rocket-admin-list">{today.map((row) => <article key={String(row.id)}><strong>{String(row.app_name)}</strong><p>{String(row.recipient_email)} · Launch source {String(row.launch_product_id)}</p><button disabled={busy} onClick={() => void act("skip_outreach", String(row.id))}>Skip</button></article>)}</div> : <Empty>No recipient has documented eligibility yet.</Empty>}</Panel>
      <Panel title="Founder queue">{rows(data.queue).length ? <div className="rocket-admin-list">{rows(data.queue).map((row) => <article key={String(row.id)}><strong>{String(row.recipient_email)} · {String(row.status)}</strong><p>App {String(row.app_id)} · {when(row.created_at)}</p><button disabled={busy || !["eligible","queued"].includes(String(row.status))} onClick={() => void act("skip_outreach", String(row.id))}>Skip</button></article>)}</div> : <Empty>No founder relationships imported yet. A private, read-only Launch founder credential and test claim flow are required before this queue is populated.</Empty>}</Panel>
    </>}
  </main>;
}
