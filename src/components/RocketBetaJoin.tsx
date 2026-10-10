import { useEffect, useState } from "react";
import { Link } from "@/lib/router-compat";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

type Status = { active: boolean; title: string | null; message: string | null; access_type: "open_waitlist" | "approval_required" | null; membership: { status: string; updates_opt_in: boolean } | null };

export default function RocketBetaJoin({ appId, appSlug }: { appId: string; appSlug: string }) {
  const { user } = useAuth();
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [category, setCategory] = useState("idea");
  const [feedback, setFeedback] = useState("");
  const [notice, setNotice] = useState("");
  const load = async () => {
    try {
      const { data, error: failure } = await supabase.functions.invoke("rocket-beta", { body: { action: "public_status", app_id: appId } });
      if (!failure && !data?.error) setStatus(data as Status);
    } catch {
      // Beta is optional on public profiles; an unavailable endpoint should not hide the app.
    }
  };
  useEffect(() => { setStatus(null); void load(); }, [appId, user?.id]);
  const call = async (action: string, extras: Record<string, unknown> = {}) => {
    setBusy(true); setError(""); setNotice("");
    try {
      const { data, error: failure } = await supabase.functions.invoke("rocket-beta", { body: { action, app_id: appId, ...extras } });
      if (failure || data?.error) throw new Error(data?.error || failure?.message || "Beta request failed");
      if (action === "feedback") { setFeedback(""); setNotice("Feedback sent to the developer."); }
      await load();
    } catch (issue) { setError(issue instanceof Error ? issue.message : "Beta request failed"); }
    finally { setBusy(false); }
  };
  if (!status?.active) return null;
  const member = status.membership?.status;
  return <section aria-label="Rocket Beta" className="mt-5 rounded-2xl border border-sky-200 bg-sky-50 p-5 sm:p-6">
    <p className="text-xs font-semibold uppercase tracking-wider text-sky-800">Rocket Beta</p>
    <h2 className="mt-2 text-xl font-semibold text-neutral-950">{status.title}</h2>
    {status.message && <p className="mt-2 whitespace-pre-wrap text-sm text-neutral-700">{status.message}</p>}
    <p className="mt-2 text-xs text-neutral-600">Joining Rocket Beta does not automatically grant access to the app’s own product.</p>
    {!user ? <Link to={`/login?next=${encodeURIComponent(`/apps/${appSlug}`)}`} className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-[#167ac6] px-4 text-sm font-semibold text-white">Log in to {status.access_type === "approval_required" ? "request access" : "join the waitlist"}</Link>
      : !member || member === "left" ? <button disabled={busy} onClick={() => call("join")} className="mt-4 min-h-11 rounded-xl bg-[#167ac6] px-4 text-sm font-semibold text-white disabled:opacity-50">{status.access_type === "approval_required" ? "Request Beta Access" : "Join Beta"}</button>
      : <div className="mt-4"><p className="text-sm font-medium text-neutral-800">Your status: {member === "approved" ? "Approved" : member === "waitlisted" ? "Waitlisted" : "Declined"}</p>
          {(member === "waitlisted" || member === "approved") && <>
            <label className="mt-3 flex items-center gap-2 text-sm text-neutral-700"><input type="checkbox" checked={status.membership?.updates_opt_in === true} disabled={busy} onChange={(event) => void call("update_preferences", { updates_opt_in: event.target.checked })} /> Email me Beta updates</label>
            <form className="mt-4 grid gap-2" onSubmit={(event) => { event.preventDefault(); void call("feedback", { category, feedback }); }}>
              <label className="text-sm font-medium" htmlFor="beta-feedback">Feedback for the developer</label>
              <select value={category} onChange={(event) => setCategory(event.target.value)} className="max-w-36 rounded-lg border bg-white px-3 py-2 text-sm"><option value="idea">Idea</option><option value="bug">Bug</option><option value="other">Other</option></select>
              <textarea id="beta-feedback" value={feedback} onChange={(event) => setFeedback(event.target.value)} minLength={5} maxLength={2000} rows={3} required className="w-full rounded-lg border bg-white p-3 text-sm" placeholder="What could be better?" />
              <div className="flex flex-wrap items-center gap-4"><button disabled={busy} className="min-h-11 rounded-lg border border-sky-700 bg-white px-4 text-sm font-semibold text-sky-800 disabled:opacity-50">Send feedback</button><button type="button" disabled={busy} onClick={() => call("leave")} className="min-h-11 text-sm text-neutral-600 underline disabled:opacity-50">Leave Beta</button></div>
            </form>
          </>}
        </div>}
    {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
    {notice && <p role="status" className="mt-3 text-sm text-green-700">{notice}</p>}
  </section>;
}
