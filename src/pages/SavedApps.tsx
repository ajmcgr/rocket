import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import SaveAppButton from "@/components/SaveAppButton";
import { signalExplanation, signalLabel, type AppSignal } from "@/lib/appIntelligence";

type App = Tables<"public_apps">;
type Saved = Tables<"saved_apps">;

export default function SavedApps() {
  const { user } = useAuth();
  const [rows, setRows] = useState<{ saved: Saved; app: App; signal?: AppSignal }[]>([]);
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
      const [appsResult, signalsResult] = ids.length ? await Promise.all([
        supabase.from("public_apps").select("*").in("id", ids),
        supabase.from("public_app_intelligence").select("*").in("app_id", ids),
      ]) : [{ data: [] as App[], error: null }, { data: [] as AppSignal[], error: null }];
      if (appsResult.error || signalsResult.error) throw appsResult.error || signalsResult.error;
      const apps = new Map((appsResult.data || []).map((app) => [app.id, app]));
      const signals = new Map<string, AppSignal>();
      for (const signal of (signalsResult.data || []).sort((a, b) =>
        (a.signal_type === "rising" ? -1 : 1) - (b.signal_type === "rising" ? -1 : 1))) {
        if (!signals.has(signal.app_id)) signals.set(signal.app_id, signal);
      }
      if (!canceled) setRows(saved.flatMap((row) => {
        const app = apps.get(row.app_id);
        return app ? [{ saved: row, app, signal: signals.get(row.app_id) }] : [];
      }));
    };
    setLoading(true); setError(false);
    load().catch(() => { if (!canceled) setError(true); }).finally(() => { if (!canceled) setLoading(false); });
    return () => { canceled = true; };
  }, [user]);

  return <div className="mx-auto max-w-5xl px-6 py-10 text-neutral-900">
    <Link to="/discover" className="text-sm text-sky-700 hover:underline">← Discover</Link>
    <h1 className="mt-4 font-display text-4xl">Saved Apps</h1>
    <p className="mt-2 text-neutral-600">Your private research shortlist. Launch evidence updates as the catalogue refreshes.</p>
    {loading && <p className="mt-8 text-neutral-500">Loading saved apps…</p>}
    {error && <p role="alert" className="mt-8 text-red-700">Saved Apps could not be loaded. Please reload.</p>}
    {!loading && !error && rows.length === 0 && <div className="mt-8 rounded-2xl border border-neutral-200 bg-white p-8"><p>No saved apps yet.</p><Link to="/discover" className="mt-3 inline-block text-sky-700 hover:underline">Explore Discover</Link></div>}
    {!loading && !error && <div className="mt-8 grid gap-4 sm:grid-cols-2">{rows.map(({ saved, app, signal }) =>
      <article key={app.id} className="rounded-2xl border border-neutral-200 bg-white p-5">
        <div className="flex items-start gap-3"><div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-neutral-100">{app.logo_url ? <img src={app.logo_url} alt="" loading="lazy" className="h-full w-full object-contain" /> : app.name[0]}</div><div className="min-w-0 flex-1"><Link to={`/apps/${app.id}`} className="font-semibold hover:text-sky-700">{app.name}</Link><p className="truncate text-sm text-neutral-500">{app.canonical_host}</p></div><SaveAppButton appId={app.id} saved onChange={(isSaved) => { if (!isSaved) setRows((current) => current.filter((item) => item.app.id !== app.id)); }} /></div>
        <p className="mt-4 line-clamp-2 text-sm text-neutral-600">{app.tagline || app.description}</p>
        {signal && <p className="mt-3 rounded-lg bg-sky-50 p-3 text-xs text-sky-900"><strong>{signalLabel(signal)}</strong><br />{signalExplanation(signal)}</p>}
        <p className="mt-4 text-xs text-neutral-500">Saved {new Date(saved.saved_at).toLocaleDateString()}</p>
      </article>)}</div>}
  </div>;
}
