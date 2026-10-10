import { useEffect, useState } from "react";
import { Link } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import { useToolkitMembership } from "@/hooks/useToolkitMembership";

type Programme = { id: string; title: string; message: string; access_type: "open_waitlist" | "approval_required"; capacity: number | null; is_active: boolean };
type Tester = { id: string; email: string; status: string; joined_at: string; updates_opt_in: boolean };
type Feedback = { id: string; membership_id: string; category: string; body: string; created_at: string };
type Delivery = { id: string; membership_id: string; kind: string; status: string; created_at: string };
type Dashboard = { programme: Programme | null; testers: Tester[]; feedback: Feedback[]; deliveries: Delivery[]; developer_active: boolean; eligible_count: number; tester_list_limited?: boolean };
const input = "w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm";

export default function RocketBetaPanel({ appId, appName }: { appId: string; appName: string }) {
  const membership = useToolkitMembership();
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState(`${appName} Beta`);
  const [message, setMessage] = useState("");
  const [capacity, setCapacity] = useState("");
  const [accessType, setAccessType] = useState<Programme["access_type"]>("open_waitlist");
  const [active, setActive] = useState(false);
  const [subject, setSubject] = useState("");
  const [updateBody, setUpdateBody] = useState("");
  const [preview, setPreview] = useState(false);
  const call = async (action: string, extra: Record<string, unknown> = {}) => {
    const { data: result, error: failure } = await supabase.functions.invoke("rocket-beta", { body: { action, app_id: appId, ...extra } });
    if (failure || result?.error) throw new Error(result?.error || failure?.message || "Beta is unavailable");
    return result;
  };
  const load = async () => {
    const result = await call("dashboard") as Dashboard;
    setData(result);
    const p = result.programme;
    if (p) { setTitle(p.title); setMessage(p.message); setCapacity(p.capacity?.toString() || ""); setAccessType(p.access_type); setActive(p.is_active); }
  };
  useEffect(() => { setData(null); setError(""); if (membership.active) void load().catch((issue) => setError(issue.message)); }, [appId, membership.active]);
  const run = async (action: string, extra: Record<string, unknown>, success: string) => {
    setBusy(true); setError(""); setNotice("");
    try { const result = await call(action, extra); await load(); setNotice(action === "send_update" ? `${result.sent} sent · ${result.suppressed} suppressed · ${result.failed} failed.` : success); if (action === "send_update") { setSubject(""); setUpdateBody(""); setPreview(false); } }
    catch (issue) { setError(issue instanceof Error ? issue.message : "Request failed"); }
    finally { setBusy(false); }
  };
  const activeCount = (data?.testers || []).filter((t) => t.status === "approved").length;
  const eligibleCount = data?.eligible_count || 0;
  return <section id="beta" className="mt-6 rounded-2xl border border-neutral-200 bg-white p-5 sm:p-6" aria-label="Rocket Beta management">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-semibold">Beta</h2><p className="mt-1 text-sm text-neutral-600">Recruit testers, manage access requests and collect private feedback.</p></div><span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-800">Rocket Developer</span></div>
    {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {notice && <p role="status" className="mt-4 rounded-lg bg-green-50 p-3 text-sm text-green-800">{notice}</p>}
    {membership.loading ? <p role="status" className="mt-5 text-sm text-neutral-500">Checking membership…</p> : !membership.active ? <p className="mt-5 text-sm text-neutral-600">An active <Link to="/settings/developer" className="font-semibold text-sky-800 underline">Rocket Developer membership</Link> is required to manage Beta. Existing tester data is retained.</p> : !data ? <p role="status" className="mt-5 text-sm text-neutral-500">Loading Beta…</p> : <>
      <form onSubmit={(event) => { event.preventDefault(); void run("configure", { title, message, capacity: capacity || null, access_type: accessType, is_active: active }, "Beta settings saved."); }} className="mt-5 grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium">Beta title<input className={`${input} mt-1`} minLength={3} maxLength={100} required value={title} onChange={(event) => setTitle(event.target.value)} /></label>
        <label className="text-sm font-medium">Access type<select className={`${input} mt-1`} value={accessType} onChange={(event) => setAccessType(event.target.value as Programme["access_type"])}><option value="open_waitlist">Open waitlist</option><option value="approval_required">Approval required</option></select></label>
        <label className="text-sm font-medium sm:col-span-2">Message to potential testers<textarea className={`${input} mt-1`} rows={2} maxLength={500} value={message} onChange={(event) => setMessage(event.target.value)} /></label>
        <label className="text-sm font-medium">Maximum approved testers (optional)<input className={`${input} mt-1`} type="number" min="1" max="10000" value={capacity} onChange={(event) => setCapacity(event.target.value)} /></label>
        <label className="flex items-center gap-2 self-end text-sm font-medium"><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} /> Accepting beta testers</label>
        <div className="sm:col-span-2"><button disabled={busy} className="min-h-11 rounded-xl bg-[#167ac6] px-4 text-sm font-semibold text-white disabled:opacity-50">Save Beta settings</button></div>
      </form>
      {data.programme && <>
        <div className="mt-7 grid gap-3 border-t pt-5 text-sm sm:grid-cols-3"><p><strong>{data.testers.filter((t) => t.status === "waitlisted").length}</strong> {data.tester_list_limited ? "waitlisted in recent 200" : "waitlisted"}</p><p><strong>{activeCount}</strong> {data.tester_list_limited ? "approved in recent 200" : "approved"}</p><p><strong>{data.feedback.length}</strong> recent feedback items</p></div>
        <h3 className="mt-6 font-semibold">Beta testers</h3>
        {!data.testers.length ? <p className="mt-2 text-sm text-neutral-500">No testers yet.</p> : <ul className="mt-3 divide-y rounded-xl border">{data.testers.map((tester) => <li key={tester.id} className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm"><div><p className="font-medium">{tester.email}</p><p className="text-neutral-500">{tester.status} · joined {new Date(tester.joined_at).toLocaleDateString()}</p></div>{["waitlisted", "approved", "declined"].includes(tester.status) && <div className="flex flex-wrap gap-2">{tester.status !== "approved" && <button disabled={busy} onClick={() => void run("set_status", { membership_id: tester.id, status: "approved" }, "Tester approved.")} className="min-h-10 rounded-lg border px-3 text-sky-800 disabled:opacity-50">Approve</button>}{tester.status !== "declined" && <button disabled={busy} onClick={() => void run("set_status", { membership_id: tester.id, status: tester.status === "approved" ? "left" : "declined" }, tester.status === "approved" ? "Tester removed." : "Tester declined.")} className="min-h-10 rounded-lg border px-3 disabled:opacity-50">{tester.status === "approved" ? "Remove" : "Decline"}</button>}</div>}</li>)}</ul>}
        <h3 className="mt-6 font-semibold">Private feedback</h3>
        {!data.feedback.length ? <p className="mt-2 text-sm text-neutral-500">No feedback yet.</p> : <ul className="mt-3 space-y-2">{data.feedback.map((entry) => <li key={entry.id} className="rounded-xl border p-3 text-sm"><p className="text-xs font-semibold uppercase text-neutral-500">{entry.category} · {new Date(entry.created_at).toLocaleDateString()}</p><p className="mt-1 whitespace-pre-wrap break-words">{entry.body}</p></li>)}</ul>}
        <h3 className="mt-6 font-semibold">Recent Beta emails</h3>
        {!data.deliveries?.length ? <p className="mt-2 text-sm text-neutral-500">No Beta emails yet.</p> : <ul className="mt-3 divide-y rounded-xl border">{data.deliveries.map((delivery) => <li key={delivery.id} className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm"><div><p className="font-medium">{delivery.kind} · {delivery.status}</p><p className="text-neutral-500">{data.testers.find((tester) => tester.id === delivery.membership_id)?.email || "Rocket tester"} · {new Date(delivery.created_at).toLocaleDateString()}</p></div>{["sent", "delivered", "bounced", "complained"].includes(delivery.status) && <button disabled={busy} onClick={() => void run("refresh_delivery", { delivery_id: delivery.id }, "Delivery status refreshed.")} className="min-h-10 rounded-lg border px-3 text-sky-800 disabled:opacity-50">Refresh status</button>}</li>)}</ul>}
        <form className="mt-7 space-y-3 border-t pt-5" onSubmit={(event) => { event.preventDefault(); if (preview) void run("send_update", { subject, message: updateBody }, "Update sent."); else setPreview(true); }}>
          <h3 className="font-semibold">Send a Beta update</h3><p className="text-xs text-neutral-500">One update per UTC day to up to 50 current testers. Only verified, unsuppressed email recipients can receive it.</p>
          <input className={input} aria-label="Update subject" placeholder="Update subject" minLength={3} maxLength={120} required value={subject} onChange={(event) => { setSubject(event.target.value); setPreview(false); }} />
          <textarea className={input} aria-label="Update message" placeholder="What changed?" minLength={10} maxLength={2000} rows={3} required value={updateBody} onChange={(event) => { setUpdateBody(event.target.value); setPreview(false); }} />
          {preview && <div className="rounded-xl bg-neutral-50 p-4 text-sm"><p className="font-semibold">Preview: {appName}: {subject}</p><p className="mt-2 whitespace-pre-wrap">{updateBody}</p><p className="mt-2 text-xs text-neutral-500">Eligible testers: {eligibleCount}</p></div>}
          <button disabled={busy || eligibleCount === 0 || eligibleCount > 50} className="min-h-11 rounded-xl border border-sky-700 px-4 text-sm font-semibold text-sky-800 disabled:opacity-50">{preview ? `Send to ${eligibleCount} testers` : "Preview update"}</button>
        </form>
      </>}
    </>}
  </section>;
}
