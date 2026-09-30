import { useEffect, useState } from "react";
import { Link } from "@/lib/router-compat";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import SaveAppButton from "@/components/SaveAppButton";
import { signalExplanation, signalLabel, type AppSignal } from "@/lib/appIntelligence";
import AppTrustBadges from "@/components/AppTrustBadges";
import AppLogo from "@/components/AppLogo";
import type { AppTrust } from "@/lib/appTrust";

type App = Tables<"public_apps">;
type Saved = Tables<"saved_apps">;

export default function SavedApps() {
  const { user } = useAuth();
  const [rows, setRows] = useState<{ saved: Saved; app: App; signal?: AppSignal; trust?: AppTrust }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!user) return;
    let canceled = false;
    const load = async () => {
      const savedResult = await supabase.from("saved_apps").select("*").eq("user_id", user.id)
        .order("saved_at", { ascending: false }).limit(200);
      if (savedResult.error) throw savedResult.error;
      const saved = savedResult.data || [];
      const ids = saved.map((row) => row.app_id);
      const [appsResult, signalsResult, trustResult] = ids.length ? await Promise.all([
        supabase.from("public_apps").select("*").in("id", ids),
        supabase.from("public_app_intelligence").select("*").in("app_id", ids),
        supabase.from("public_app_trust").select("*").in("app_id", ids),
      ]) : [{ data: [] as App[], error: null }, { data: [] as AppSignal[], error: null }, { data: [] as AppTrust[], error: null }];
      if (appsResult.error || signalsResult.error) throw appsResult.error || signalsResult.error;
      const apps = new Map((appsResult.data || []).map((app) => [app.id, app]));
      const trusts = new Map((trustResult.data || []).map((item) => [item.app_id, item]));
      const signals = new Map<string, AppSignal>();
      for (const signal of (signalsResult.data || []).sort((a, b) =>
        (a.signal_type === "rising" ? -1 : 1) - (b.signal_type === "rising" ? -1 : 1))) {
        if (!signals.has(signal.app_id)) signals.set(signal.app_id, signal);
      }
      if (!canceled) setRows(saved.flatMap((row) => {
        const app = apps.get(row.app_id);
        return app ? [{ saved: row, app, signal: signals.get(row.app_id), trust: trusts.get(row.app_id) }] : [];
      }));
    };
    setLoading(true); setError(false);
    load().catch(() => { if (!canceled) setError(true); }).finally(() => { if (!canceled) setLoading(false); });
    return () => { canceled = true; };
  }, [user]);

  return <div className="mx-auto max-w-5xl px-5 pb-24 pt-10 text-neutral-900 sm:px-8 sm:pt-14">
    <Link to="/discover" className="inline-flex min-h-11 items-center text-sm font-medium text-sky-800 hover:underline">← Discover</Link>
    <h1 className="mt-3 font-display text-4xl sm:text-5xl">Saved Apps</h1>
    <p className="mt-3 max-w-2xl text-neutral-600">Your shortlist of apps worth returning to. Looking for a design? <Link to="/saved" className="font-medium text-sky-800 hover:underline">Open Saved Designs in Create</Link>.</p>
    {loading && <div role="status" aria-label="Loading saved apps" className="mt-8 grid gap-4 sm:grid-cols-2">{[0, 1].map((item) => <div key={item} className="rocket-skeleton-surface h-52 animate-pulse rounded-[1.5rem] border border-neutral-200 p-5"><div className="h-14 w-14 rounded-2xl bg-neutral-100" /><div className="mt-5 h-4 w-2/3 rounded bg-neutral-100" /></div>)}</div>}
    {error && <p role="alert" className="mt-8 rounded-2xl border border-red-200 bg-white p-6 text-red-700">Saved Apps could not be loaded. Please reload.</p>}
    {!loading && !error && rows.length === 0 && <div className="mt-8 rounded-[1.5rem] border border-neutral-200 bg-white p-8 sm:p-10"><h2 className="font-display text-2xl">Your shortlist starts here.</h2><p className="mt-2 text-sm text-neutral-600">Save apps you want to try or revisit. They will appear here.</p><Link to="/discover" className="mt-5 inline-flex min-h-11 items-center font-semibold text-sky-800 hover:underline">Explore apps →</Link></div>}
    {!loading && !error && <div className="mt-8 grid gap-4 sm:grid-cols-2">{rows.map(({ saved, app, signal, trust }) =>
      <article key={app.id} className="flex min-h-52 flex-col rounded-[1.5rem] border border-neutral-200 bg-white p-5 shadow-[0_14px_36px_-34px_rgba(15,23,42,0.4)] transition hover:border-sky-300">
        <div className="flex items-start gap-3"><AppLogo name={app.name} src={app.logo_url} className="h-14 w-14" /><div className="min-w-0 flex-1"><Link to={`/apps/${app.id}`} className="line-clamp-1 font-semibold text-neutral-950 hover:text-sky-800">{app.name}</Link><p className="truncate text-sm text-neutral-500">{app.canonical_host}</p></div><SaveAppButton appId={app.id} saved onChange={(isSaved) => { if (!isSaved) setRows((current) => current.filter((item) => item.app.id !== app.id)); }} /></div>
        <p className="mt-4 line-clamp-2 text-sm leading-relaxed text-neutral-600">{app.tagline || app.description || "Explore this app."}</p>
        <AppTrustBadges trust={trust} compact className="mt-3" />
        {signal && <p className="mt-3 rounded-lg bg-sky-50 p-3 text-xs text-sky-900"><strong>{signalLabel(signal)}</strong><br />{signalExplanation(signal)}</p>}
        <p className="mt-4 text-xs text-neutral-500">Saved {new Date(saved.saved_at).toLocaleDateString()}</p>
      </article>)}</div>}
  </div>;
}
