import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import AppLogo from "./AppLogo";
import { signalLabel } from "@/lib/appIntelligence";

type App = Tables<"public_apps">;
type Signal = Tables<"public_app_intelligence">;
type Category = Tables<"public_app_categories">;
type Preview = { app: App; signal: Signal };

export default function DiscoveryPreview() {
  const [rising, setRising] = useState<Preview[]>([]);
  const [fresh, setFresh] = useState<Preview[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const [risingResult, newResult, categoryResult] = await Promise.all([
        supabase.from("public_app_intelligence").select("*").eq("signal_type", "rising").order("percentile_rank", { ascending: false }).order("net_votes", { ascending: false }).limit(4),
        supabase.from("public_app_intelligence").select("*").eq("signal_type", "new_interesting").order("percentile_rank", { ascending: false }).order("net_votes", { ascending: false }).limit(4),
        supabase.from("public_app_categories").select("category,app_count").order("app_count", { ascending: false }).limit(6),
      ]);
      const risingSignals = risingResult.data || [];
      const newSignals = newResult.data || [];
      const ids = [...new Set([...risingSignals, ...newSignals].map((signal) => signal.app_id))];
      const appResult = ids.length ? await supabase.from("public_apps").select("*").in("id", ids) : { data: [] as App[] };
      if (!active) return;
      const apps = new Map((appResult.data || []).map((app) => [app.id, app]));
      const mapRows = (signals: Signal[]) => signals.flatMap((signal) => {
        const app = apps.get(signal.app_id);
        return app ? [{ app, signal }] : [];
      });
      setRising(mapRows(risingSignals));
      setFresh(mapRows(newSignals));
      setCategories(categoryResult.data || []);
      setLoading(false);
    };
    load().catch(() => { if (active) { setFailed(true); setLoading(false); } });
    return () => { active = false; };
  }, []);

  const section = (title: string, rows: Preview[], view: string) => rows.length > 0 && <section className="mt-12 sm:mt-14">
    <div className="mb-5 flex items-end justify-between gap-4"><div><h2 className="font-display text-3xl text-neutral-950 sm:text-4xl">{title}</h2><p className="mt-1 text-sm text-neutral-600">Observed public Launch activity, not a Rocket endorsement.</p></div><Link to={`/discover?view=${view}`} className="inline-flex min-h-11 shrink-0 items-center text-sm font-semibold text-sky-800 hover:underline">View all</Link></div>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{rows.map(({ app, signal }) => <Link key={app.id} to={`/apps/${app.id}`} className="group flex min-h-56 flex-col rounded-[1.5rem] border border-neutral-200 bg-white p-5 shadow-[0_14px_36px_-34px_rgba(15,23,42,0.4)] transition hover:-translate-y-0.5 hover:border-sky-300 hover:shadow-[0_18px_38px_-30px_rgba(15,23,42,0.28)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500">
      <div className="flex items-start justify-between gap-3"><AppLogo name={app.name} src={app.logo_url} className="h-14 w-14" /><ArrowUpRight className="h-4 w-4 text-neutral-400 transition group-hover:text-sky-800" aria-hidden="true" /></div>
      <h3 className="mt-5 line-clamp-1 text-base font-semibold text-neutral-950">{app.name}</h3><p className="mt-1 line-clamp-2 min-h-10 text-sm leading-relaxed text-neutral-600">{app.tagline || app.description || "Explore this app."}</p><div className="mt-auto flex items-center justify-between gap-2 pt-5"><span className="truncate text-xs text-neutral-500">{app.categories[0] || app.canonical_host}</span><span className="shrink-0 rounded-full bg-sky-50 px-2 py-1 text-[11px] font-medium text-sky-900">{signalLabel(signal).replace(" on Launch", "")}</span></div>
    </Link>)}</div>
  </section>;

  if (loading) return <div className="mt-12" role="status" aria-label="Finding apps worth exploring"><div className="mb-5 h-8 w-28 animate-pulse rounded-lg bg-neutral-200" /><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map((item) => <div key={item} className="h-56 animate-pulse rounded-[1.5rem] border border-neutral-200 bg-white p-5"><div className="h-14 w-14 rounded-2xl bg-neutral-100" /><div className="mt-6 h-4 w-2/3 rounded bg-neutral-100" /><div className="mt-3 h-3 w-4/5 rounded bg-neutral-100" /></div>)}</div></div>;
  if (failed) return <div role="status" className="mt-12 rounded-2xl border border-neutral-200 bg-white p-6 text-sm text-neutral-600">Apps could not be loaded right now. <Link to="/discover" className="font-semibold text-sky-800 hover:underline">Open Discover</Link></div>;
  return <>
    {section("Rising", rising, "rising")}
    {section("New & interesting", fresh, "new")}
    {categories.length > 0 && <section className="mt-12"><div className="mb-5 flex items-end justify-between"><h2 className="font-display text-2xl text-neutral-950 sm:text-3xl">Explore categories</h2><Link to="/discover?view=categories" className="text-sm font-semibold text-sky-700 hover:underline">All categories</Link></div><div className="flex flex-wrap gap-2">{categories.map((item) => <Link key={item.category} to={`/discover?view=all&category=${encodeURIComponent(item.category)}`} className="rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm text-neutral-700 transition hover:border-sky-300 hover:text-sky-700">{item.category}</Link>)}</div></section>}
  </>;
}
