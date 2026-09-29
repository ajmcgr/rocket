import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type App = Tables<"public_apps">;
type Signal = Tables<"public_app_intelligence">;
type Category = Tables<"public_app_categories">;
type Preview = { app: App; signal: Signal };

export default function DiscoveryPreview() {
  const [rising, setRising] = useState<Preview[]>([]);
  const [fresh, setFresh] = useState<Preview[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

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
    load().catch(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const section = (title: string, rows: Preview[], view: string) => rows.length > 0 && <section className="mt-12">
    <div className="mb-5 flex items-end justify-between gap-4"><div><h2 className="font-display text-2xl text-neutral-950 sm:text-3xl">{title}</h2><p className="mt-1 text-sm text-neutral-500">Based on public Launch activity, not a Rocket endorsement.</p></div><Link to={`/discover?view=${view}`} className="shrink-0 text-sm font-semibold text-sky-700 hover:underline">View all</Link></div>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{rows.map(({ app }) => <Link key={app.id} to={`/apps/${app.id}`} className="group rounded-2xl border border-neutral-200 bg-white p-4 transition hover:border-sky-300 hover:shadow-sm">
      <div className="flex items-start justify-between gap-3"><div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-neutral-100 font-semibold text-neutral-500">{app.logo_url ? <img src={app.logo_url} alt="" loading="lazy" className="h-full w-full object-contain" /> : app.name[0]}</div><ArrowUpRight className="h-4 w-4 text-neutral-400 group-hover:text-sky-700" /></div>
      <h3 className="mt-4 truncate font-semibold text-neutral-900">{app.name}</h3><p className="mt-1 line-clamp-2 min-h-10 text-sm text-neutral-600">{app.tagline || app.description || "Explore this app."}</p><p className="mt-3 truncate text-xs text-neutral-500">{app.categories[0] || app.canonical_host}</p>
    </Link>)}</div>
  </section>;

  if (loading) return <p className="mt-12 text-sm text-neutral-500">Finding apps worth exploring…</p>;
  return <>
    {section("Rising", rising, "rising")}
    {section("New & interesting", fresh, "new")}
    {categories.length > 0 && <section className="mt-12"><div className="mb-5 flex items-end justify-between"><h2 className="font-display text-2xl text-neutral-950 sm:text-3xl">Explore categories</h2><Link to="/discover?view=categories" className="text-sm font-semibold text-sky-700 hover:underline">All categories</Link></div><div className="flex flex-wrap gap-2">{categories.map((item) => <Link key={item.category} to={`/discover?view=all&category=${encodeURIComponent(item.category)}`} className="rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm text-neutral-700 transition hover:border-sky-300 hover:text-sky-700">{item.category}</Link>)}</div></section>}
  </>;
}
