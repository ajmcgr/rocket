import { useEffect, useMemo, useState } from "react";
import { Link } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import RocketShare from "@/components/RocketShare";
import { track } from "@/lib/analytics";
import { completedUtcMonth, meaningfulHighlight, monthLabel, monthlyChange, priorMonth, type Recap, type RecapShare } from "@/lib/rocketRecap";

const button = "inline-flex min-h-11 items-center justify-center rounded-xl bg-sky-600 px-5 py-3 text-sm font-semibold text-white hover:bg-sky-700";
const secondary = "inline-flex min-h-11 items-center justify-center rounded-xl border border-neutral-200 px-5 py-3 text-sm font-semibold hover:border-sky-400";

export default function RocketRecap() {
  const [recaps, setRecaps] = useState<Recap[]>([]);
  const [shares, setShares] = useState<RecapShare[]>([]);
  const [month, setMonth] = useState("");
  const [appId, setAppId] = useState("");
  const [selected, setSelected] = useState<string[]>(["views", "clicks"]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const refresh = async () => {
    const { data, error: requestError } = await (supabase as any).rpc("my_rocket_recaps");
    if (requestError) { setError("Your recap could not load. Please try again."); setLoading(false); return; }
    const next = Array.isArray(data?.recaps) ? data.recaps as Recap[] : [];
    setRecaps(next);
    setShares(Array.isArray(data?.shares) ? data.shares as RecapShare[] : []);
    setMonth((current) => next.some((item) => item.month === current) ? current : next[0]?.month || "");
    setLoading(false);
  };
  useEffect(() => { void refresh(); track("rocket_recap_viewed", { surface: "private" }); }, []);
  const recap = recaps.find((item) => item.month === month);
  const app = recap?.apps.find((item) => item.id === appId);
  const metrics = app || recap?.totals;
  const prior = recaps.find((item) => item.month === priorMonth(month));
  const highlight = useMemo(() => meaningfulHighlight(recap?.apps || []), [recap]);
  const visibleMetrics = (["views", "clicks"] as const).filter((key) => Number(metrics?.[key] || 0) > 0);
  const matchingShares = shares.filter((item) => item.month === month && item.app_id === (appId || null));
  const createShare = async () => {
    setError(""); setBusy(true);
    const approved = selected.filter((key) => visibleMetrics.includes(key as "views" | "clicks"));
    if (!approved.length) { setError("Choose a metric to share."); setBusy(false); return; }
    const { error: requestError } = await (supabase as any).rpc("create_rocket_recap_share", { p_month: month, p_app_id: appId || null, p_metrics: approved });
    if (requestError) setError("We could not create that link. Check that your app is still eligible.");
    else { track("rocket_recap_share_created", { month, app: appId || "portfolio" }); await refresh(); }
    setBusy(false);
  };
  const revoke = async (id: string) => {
    setBusy(true);
    const { data, error: requestError } = await (supabase as any).rpc("revoke_rocket_recap_share", { p_id: id });
    if (requestError || !data) setError("That link could not be revoked. Please try again.");
    else { track("rocket_recap_share_revoked", { month }); await refresh(); }
    setBusy(false);
  };

  return <main className="mx-auto min-h-[70vh] max-w-5xl px-5 py-12 sm:px-8 sm:py-16">
    <p className="text-xs font-bold uppercase tracking-[0.22em] text-sky-600">Rocket Recap</p>
    <h1 className="mt-3 text-4xl font-bold tracking-tight text-neutral-950 sm:text-6xl">Your month building on Rocket.</h1>
    {loading ? <p className="mt-10 text-neutral-600">Loading your story…</p> : !recap ? <section className="mt-12 rounded-3xl border border-neutral-200 bg-white p-8 sm:p-12">
      <p className="text-sm font-semibold text-sky-700">{monthLabel(completedUtcMonth())}</p>
      <h2 className="mt-3 text-2xl font-bold text-neutral-950">Your Rocket story is just getting started.</h2>
      <p className="mt-3 max-w-xl text-neutral-600">There is no completed month with eligible Rocket activity yet. Share your app to help more people discover it.</p>
      <Link to="/your-apps" className={`${button} mt-7`}>Share your app</Link>
    </section> : <>
      <div className="mt-8 flex flex-wrap items-center gap-3">
        <label htmlFor="recap-month" className="text-sm font-semibold">Month</label>
        <select id="recap-month" value={month} onChange={(event) => { setMonth(event.target.value); setAppId(""); }} className="min-h-11 rounded-xl border border-neutral-200 bg-white px-4 text-sm">{recaps.map((item) => <option key={item.month} value={item.month}>{monthLabel(item.month)}</option>)}</select>
        <label htmlFor="recap-app" className="ml-0 text-sm font-semibold sm:ml-3">View</label>
        <select id="recap-app" value={appId} onChange={(event) => setAppId(event.target.value)} className="min-h-11 max-w-full rounded-xl border border-neutral-200 bg-white px-4 text-sm"><option value="">All my apps</option>{recap.apps.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
      </div>
      <section className="mt-8 overflow-hidden rounded-3xl bg-[#0b1522] p-7 text-white sm:p-12">
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-[#72c0ed]">Your {monthLabel(month)} on Rocket</p>
        <h2 className="mt-7 max-w-3xl text-4xl font-bold tracking-tight sm:text-6xl">{app ? app.name : "People found what you built."}</h2>
        <p className="mt-5 max-w-2xl text-lg text-slate-300">A look at genuine activity across {app ? "this app" : `${recap.totals.app_count} public ${recap.totals.app_count === 1 ? "app" : "apps"}`}.</p>
        <div className="mt-12 grid gap-3 sm:grid-cols-2">{visibleMetrics.map((key) => <div key={key} className="rounded-2xl border border-white/15 bg-white/5 p-6">
          <p className="text-sm text-slate-300">{key === "views" ? "Recorded app visits" : "Recorded website clicks"}</p>
          <p className="mt-2 text-5xl font-bold text-white">{Number(metrics?.[key] || 0).toLocaleString()}</p>
          <p className="mt-3 text-xs text-slate-400">{recap.coverage[key] === "partial" ? "Partial data · tracking began during this month" : "Completed UTC month"}</p>
          {!app && monthlyChange(recap, prior, key) && <p className="mt-2 text-xs text-[#72c0ed]">{monthlyChange(recap, prior, key)}</p>}
        </div>)}</div>
      </section>
      {highlight && !app && <section className="mt-8 rounded-3xl border border-neutral-200 bg-white p-7 sm:p-9"><p className="text-sm font-bold uppercase tracking-[0.15em] text-sky-700">Your highlight</p><h3 className="mt-3 text-2xl font-bold">{highlight.name} had the most recorded visits.</h3><p className="mt-2 text-neutral-600">{highlight.views.toLocaleString()} recorded app visits in {monthLabel(month)}.</p><Link to={`/apps/${highlight.slug}`} className="mt-4 inline-block font-semibold text-sky-700">View app</Link></section>}
      <section className="mt-8 rounded-3xl border border-neutral-200 bg-white p-7 sm:p-9">
        <h3 className="text-2xl font-bold">Share your month</h3><p className="mt-2 text-neutral-600">Your recap is private. Choose exactly what a public link may show.</p>
        <div className="mt-5 flex flex-wrap gap-5">{visibleMetrics.map((key) => <label key={key} className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={selected.includes(key)} onChange={(event) => setSelected((value) => event.target.checked ? [...value, key] : value.filter((item) => item !== key))} />{key === "views" ? "Recorded app visits" : "Recorded website clicks"}: {Number(metrics?.[key] || 0).toLocaleString()}</label>)}</div>
        <p className="mt-2 text-xs text-neutral-500">Rocket records at most one app visit per visitor per app per UTC day. Website clicks are outbound actions, not customers.</p>
        <p className="mt-2 text-xs text-neutral-500">The public card will also show {app ? app.name : "your public Rocket handle"} and {monthLabel(month)}. It will not include provider metrics or private app data.</p>
        <button type="button" disabled={busy} onClick={() => void createShare()} className={`${button} mt-6 disabled:opacity-50`}>Create shareable recap</button>
        {matchingShares.map((item) => <div key={item.id} className="mt-5 flex flex-wrap items-center gap-3 rounded-xl border border-neutral-200 p-4"><p className="mr-auto text-sm">Public link · {Object.keys(item.snapshot.metrics).map((key) => key === "views" ? "recorded visits" : "website clicks").join(" + ")}</p><RocketShare kind="recap" identifier={item.id} title={`${monthLabel(month)} Rocket Recap`} /><button type="button" disabled={busy} onClick={() => void revoke(item.id)} className={secondary}>Revoke link</button></div>)}
      </section>
    </>}
    {error && <p role="alert" className="mt-5 text-sm text-red-700">{error}</p>}
  </main>;
}
