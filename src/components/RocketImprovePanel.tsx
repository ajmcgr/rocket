import { useEffect, useState } from "react";
import { Link } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import { useToolkitMembership } from "@/hooks/useToolkitMembership";

type Recommendation = { category: string; title: string; action: string; evidence_key: string; proposed_description: string | null };
type Run = { id: string; created_at: string; recommendations: Recommendation[]; context_snapshot: { facts: Record<string, string | number>; presentation_description: string | null } };
type Decision = { run_id: string; recommendation_index: number; status: string };
const labels: Record<string, string> = { description: "Current description", category: "Current category", tagline: "Current tagline", views_30d: "Rocket profile views in 30 days", outbound_clicks_30d: "Rocket outbound clicks in 30 days", saves_current: "Current saves" };

export default function RocketImprovePanel({ appId }: { appId: string }) {
  const membership = useToolkitMembership();
  const [runs, setRuns] = useState<Run[]>([]);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const call = async (action: string, extra: Record<string, unknown> = {}) => {
    const { data, error: failure } = await supabase.functions.invoke("rocket-developer-toolkit", { body: { action, app_id: appId, ...extra } });
    if (failure || data?.error) throw new Error(data?.error || failure?.message || "Optimizer unavailable");
    return data;
  };
  const load = async () => { const result = await call("history"); setRuns(result.runs || []); setDecisions(result.actions || []); };
  useEffect(() => { setRuns([]); setDecisions([]); if (membership.active) void load().catch((issue) => setError(issue.message)); }, [appId, membership.active]);
  const run = async (action: string, extra: Record<string, unknown> = {}) => {
    setBusy(true); setError(""); setNotice("");
    try { await call(action, extra); await load(); setNotice(action === "generate" ? "New recommendations are ready." : action === "apply" ? "Description updated after your approval." : "Recommendation dismissed."); }
    catch (issue) { setError(issue instanceof Error ? issue.message : "Optimizer unavailable"); }
    finally { setBusy(false); }
  };
  const latest = runs[0];
  return <section id="improve" aria-label="AI App Optimizer" className="mt-6 rounded-2xl border border-neutral-200 bg-white p-5 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-semibold">Improve</h2><p className="mt-1 text-sm text-neutral-600">AI recommendations grounded in your Rocket listing and marketplace activity.</p></div><span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-800">Rocket Developer</span></div>
    {membership.loading ? <p role="status" className="mt-4 text-sm text-neutral-500">Checking membership…</p> : !membership.active ? <p className="mt-4 text-sm text-neutral-600">Get listing recommendations with <Link to="/settings/developer" className="font-semibold text-sky-800 underline">Rocket Developer</Link>.</p> : <>
      <p className="mt-3 text-xs text-neutral-500">One run per app per UTC day. Suggestions never change your public listing without your approval.</p>
      <button disabled={busy} onClick={() => void run("generate")} className="mt-4 min-h-11 rounded-xl bg-[#167ac6] px-4 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Working…" : latest ? "Run optimizer again" : "Analyze my app"}</button>
      {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {notice && <p role="status" className="mt-4 text-sm text-green-700">{notice}</p>}
      {latest && <div className="mt-6 space-y-4"><p className="text-xs text-neutral-500">Generated {new Date(latest.created_at).toLocaleString()} from the data available then.</p>
        {latest.recommendations.map((recommendation, index) => {
          const decision = decisions.find((item) => item.run_id === latest.id && item.recommendation_index === index);
          const fact = latest.context_snapshot.facts[recommendation.evidence_key];
          return <article key={`${latest.id}-${index}`} className="rounded-xl border border-neutral-200 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-sky-800">{recommendation.category}</p>
            <h3 className="mt-1 font-semibold">{recommendation.title}</h3>
            <p className="mt-2 text-sm text-neutral-700">{recommendation.action}</p>
            <p className="mt-3 text-xs text-neutral-500">Evidence: {labels[recommendation.evidence_key] || recommendation.evidence_key}: {fact === null || fact === undefined || fact === "" ? "Not supplied" : String(fact)}</p>
            {recommendation.proposed_description && <div className="mt-4 grid gap-3 sm:grid-cols-2"><div className="rounded-lg bg-neutral-50 p-3 text-sm"><p className="mb-2 text-xs font-semibold uppercase text-neutral-500">Current</p><p className="whitespace-pre-wrap break-words">{latest.context_snapshot.facts.description || "No description"}</p></div><div className="rounded-lg bg-sky-50 p-3 text-sm"><p className="mb-2 text-xs font-semibold uppercase text-sky-800">Proposed</p><p className="whitespace-pre-wrap break-words">{recommendation.proposed_description}</p></div></div>}
            {decision ? <p className="mt-4 text-xs font-semibold text-neutral-500">{decision.status === "applied" ? "Applied" : "Dismissed"}</p> : <div className="mt-4 flex flex-wrap gap-3">{recommendation.proposed_description && <button disabled={busy} onClick={() => void run("apply", { run_id: latest.id, index })} className="min-h-10 rounded-lg bg-[#167ac6] px-3 text-sm font-semibold text-white disabled:opacity-50">Apply description</button>}<button disabled={busy} onClick={() => void run("dismiss", { run_id: latest.id, index })} className="min-h-10 rounded-lg border px-3 text-sm font-medium disabled:opacity-50">Dismiss</button></div>}
          </article>;
        })}
      </div>}
    </>}
  </section>;
}
