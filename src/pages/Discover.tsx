import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowRight, Search } from "lucide-react";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import { useDocumentMeta } from "@/hooks/useDocumentMeta";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { useAuth } from "@/contexts/AuthContext";
import SaveAppButton from "@/components/SaveAppButton";
import { signalExplanation, signalLabel, type AppSignal } from "@/lib/appIntelligence";
import AppTrustBadges from "@/components/AppTrustBadges";
import type { AppTrust } from "@/lib/appTrust";
import DiscoveryPreview from "@/components/DiscoveryPreview";

type App = Tables<"public_apps">;
const PAGE_SIZE = 24;
const formatDate = (date: string | null) => date ? new Date(date).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : null;
const safeSearch = (value: string) => value.replace(/[^\p{L}\p{N}\s-]/gu, " ").trim().slice(0, 80);

export default function Discover() {
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState(params.get("q") || "");
  const [apps, setApps] = useState<App[]>([]);
  const [categories, setCategories] = useState<Tables<"public_app_categories">[]>([]);
  const [categorySignals, setCategorySignals] = useState<Tables<"public_category_intelligence">[]>([]);
  const [signals, setSignals] = useState<Map<string, AppSignal>>(new Map());
  const [trust, setTrust] = useState<Map<string, AppTrust>>(new Map());
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const { user } = useAuth();
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const category = params.get("category") || "";
  const platform = params.get("platform") || "";
  const source = params.get("source") || "";
  const sort = params.get("sort") === "discovered" ? "discovered" : "launched";
  const page = Math.max(0, Math.min(Number(params.get("page") || 0) || 0, 1000));
  const rawSearch = params.get("q") || "";
  const search = safeSearch(rawSearch);
  const view = ["rising", "new", "categories", "all"].includes(params.get("view") || "")
    ? params.get("view")! : "all";
  const showOverview = !params.get("view") && !search && !category && !platform && !source && page === 0;

  useEffect(() => { setQuery(rawSearch); }, [rawSearch]);

  useDocumentMeta({ title: "Discover apps | Rocket", description: "Explore launched apps and find what to build next. Browse real products by category, platform and launch date.", canonical: "https://tryrocket.ai/discover" });

  useEffect(() => {
    supabase.from("public_app_categories").select("category,app_count").order("app_count", { ascending: false }).limit(100)
      .then(({ data }) => { if (data) setCategories(data); });
    supabase.from("public_category_intelligence").select("*")
      .order("launch_volume_change_pct", { ascending: false }).limit(20)
      .then(({ data }) => { if (data) setCategorySignals(data); });
  }, []);

  useEffect(() => {
    let canceled = false;
    setLoading(true);
    setError(null);
    const load = async () => {
      if (view === "categories") { setApps([]); setTrust(new Map()); setCount(categorySignals.length); setLoading(false); return; }
      if (view === "rising" || view === "new") {
        const { data: signalRows, count: total, error: signalError } = await supabase
          .from("public_app_intelligence").select("*", { count: "exact" })
          .eq("signal_type", view === "rising" ? "rising" : "new_interesting")
          .order("percentile_rank", { ascending: false }).order("net_votes", { ascending: false })
          .order("app_id", { ascending: true }).range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
        if (signalError) throw signalError;
        const ids = (signalRows || []).map((row) => row.app_id);
        const [appResult, trustResult] = ids.length ? await Promise.all([
          supabase.from("public_apps").select("*").in("id", ids),
          supabase.from("public_app_trust").select("*").in("app_id", ids),
        ]) : [{ data: [] as App[], error: null }, { data: [] as AppTrust[], error: null }];
        if (appResult.error) throw appResult.error;
        const byId = new Map((appResult.data || []).map((app) => [app.id, app]));
        if (!canceled) {
          setApps(ids.map((id) => byId.get(id)).filter((app): app is App => Boolean(app)));
          setSignals(new Map((signalRows || []).map((row) => [row.app_id, row])));
          setTrust(new Map((trustResult.data || []).map((row) => [row.app_id, row])));
          setCount(total || 0);
        }
      } else {
        let request = supabase.from("public_apps").select("*", { count: "exact" });
        if (search) request = request.or(`name.ilike.%${search}%,tagline.ilike.%${search}%,description.ilike.%${search}%`);
        if (category) request = request.contains("categories", [category]);
        if (platform) request = request.contains("platforms", [platform]);
        if (source === "launch") request = request.not("launch_url", "is", null);
        const { data, error: queryError, count: total } = await request
          .order(sort === "discovered" ? "discovered_at" : "launched_at", { ascending: false, nullsFirst: false })
          .order("id", { ascending: true }).range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
        if (queryError) throw queryError;
        const ids = (data || []).map((app) => app.id);
        const [evidence, trustResult] = ids.length ? await Promise.all([
          supabase.from("public_app_intelligence").select("*").in("app_id", ids),
          supabase.from("public_app_trust").select("*").in("app_id", ids),
        ]) : [{ data: [] as AppSignal[] }, { data: [] as AppTrust[] }];
        if (!canceled) {
          setApps(data || []); setCount(total || 0);
          setSignals(new Map((evidence.data || []).filter((row) => row.signal_type === "rising").map((row) => [row.app_id, row])));
          setTrust(new Map((trustResult.data || []).map((row) => [row.app_id, row])));
        }
      }
      if (!canceled) setLoading(false);
    };
    load().catch(() => { if (!canceled) { setError("The catalogue could not be loaded. Please try again."); setLoading(false); } });
    return () => { canceled = true; };
  }, [search, category, platform, source, sort, page, view, categorySignals.length]);

  useEffect(() => {
    if (!user || apps.length === 0) { setSavedIds(new Set()); return; }
    let canceled = false;
    supabase.from("saved_apps").select("app_id").eq("user_id", user.id).in("app_id", apps.map((app) => app.id))
      .then(({ data }) => { if (!canceled) setSavedIds(new Set((data || []).map((row) => row.app_id))); });
    return () => { canceled = true; };
  }, [user, apps]);

  const change = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    if (key !== "view") next.set("view", "all");
    if (key === "view" && value !== "all") {
      for (const filter of ["q", "category", "platform", "source", "sort"]) next.delete(filter);
      setQuery("");
    }
    next.delete("page");
    setParams(next);
  };

  return <div className="min-h-screen bg-[#f6f8fb] text-neutral-900">
    <SiteHeader />
    <main className="mx-auto max-w-7xl px-5 pb-20 pt-10 sm:px-8 sm:pt-14">
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-700">Rocket Discover</p>
      <h1 className="mt-3 font-display text-4xl tracking-tight sm:text-5xl">Discover independent apps worth using.</h1>
      <p className="mt-3 max-w-2xl text-neutral-600">Explore what is rising, find something new, or search the full catalogue.</p>
      <form role="search" className="mt-8 flex w-full max-w-2xl gap-2 rounded-2xl border border-neutral-200 bg-white p-2 shadow-sm focus-within:ring-2 focus-within:ring-sky-200" onSubmit={(event) => { event.preventDefault(); change("q", safeSearch(query)); }}>
        <Search className="my-auto ml-3 h-5 w-5 shrink-0 text-neutral-400" aria-hidden="true" />
        <input aria-label="Search apps" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search apps, tools, or ideas" className="min-w-0 flex-1 bg-transparent px-1 text-sm outline-none sm:text-base" />
        <button className="rounded-xl bg-neutral-900 px-4 py-3 text-sm font-semibold text-white hover:bg-neutral-700">Search</button>
      </form>
      <nav aria-label="Discover sections" className="mt-7 flex flex-wrap gap-2">
        {([ ["rising", "Rising"], ["new", "New"], ["categories", "Categories"], ["all", "All Apps"] ] as const).map(([key, label]) =>
          <button key={key} onClick={() => change("view", key)} aria-current={view === key ? "page" : undefined}
            className={`rounded-full px-4 py-2 text-sm ${view === key ? "bg-neutral-900 text-white" : "border border-neutral-200 bg-white text-neutral-700 hover:border-sky-300"}`}>{label}</button>)}
      </nav>
      {showOverview && <DiscoveryPreview />}
      {view === "all" && <details className="mt-9 rounded-xl border border-neutral-200 bg-white p-4" open={Boolean(search || category || platform || source || params.get("sort"))}>
        <summary className="cursor-pointer text-sm font-semibold text-neutral-700">Filters and sorting</summary>
      <div className="mt-4 flex flex-wrap gap-3">
        <select aria-label="Category" value={category} onChange={(event) => change("category", event.target.value)} className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm"><option value="">All categories</option>{categories.map((item) => <option key={item.category} value={item.category}>{item.category} ({item.app_count})</option>)}</select>
        <select aria-label="Platform" value={platform} onChange={(event) => change("platform", event.target.value)} className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm"><option value="">All platforms</option><option value="web">Web</option><option value="ios">iOS</option><option value="android">Android</option><option value="hardware">Hardware</option></select>
        <select aria-label="Source" value={source} onChange={(event) => change("source", event.target.value)} className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm"><option value="">All sources</option><option value="launch">Launch</option></select>
        <select aria-label="Order" value={sort} onChange={(event) => change("sort", event.target.value)} className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm"><option value="launched">Newest launches</option><option value="discovered">Recently discovered</option></select>
      </div>
      </details>}
      <div className="mt-9 flex items-center justify-between text-sm text-neutral-500"><span>{loading ? "Loading apps…" : view === "categories" ? `${categorySignals.length} categories` : `${count.toLocaleString()} ${count === 1 ? "app" : "apps"}`}</span><span>{view === "all" ? "All Apps" : "Public Launch activity"}</span></div>
      {error && <div role="alert" className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">{error}</div>}
      {!loading && !error && view !== "categories" && apps.length === 0 && <div className="mt-6 rounded-xl border border-neutral-200 bg-white p-8 text-neutral-600">{view === "all" ? "No apps match these filters." : "No apps currently meet this evidence threshold. Browse all apps instead."}</div>}
      {view === "categories" && !loading && !error && <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{categorySignals.map((item) =>
        <button key={item.category} onClick={() => { const next = new URLSearchParams(params); next.set("view", "all"); next.set("category", item.category); next.delete("page"); setParams(next); }}
          className="rounded-2xl border border-neutral-200 bg-white p-5 text-left hover:border-sky-300">
          <h2 className="font-semibold">{item.category}</h2>
          <p className="mt-3 text-sm text-neutral-700">{item.recent_launches} Launch products in the last 30 days vs {item.previous_launches} in the preceding 30 days.</p>
          <p className="mt-2 text-sm text-neutral-600">{item.launch_volume_change_pct! >= 0 ? "+" : ""}{item.launch_volume_change_pct}% launch activity · {item.recent_catalogue_share_pct}% of recent Rocket listings</p>
          <p className="mt-3 text-xs text-neutral-500">Observed founder activity, not customer demand · Updated {formatDate(item.calculated_at)}</p>
        </button>)}</div>}
      {view !== "categories" && <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {apps.map((app) => <article key={app.id} className="group rounded-2xl border border-neutral-200 bg-white p-5 transition hover:border-sky-300 hover:shadow-sm">
          <Link to={`/apps/${app.id}`} className="block" aria-label={`View ${app.name}`}>
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-neutral-100 text-lg font-semibold text-neutral-500">{app.logo_url ? <img src={app.logo_url} alt="" loading="lazy" className="h-full w-full object-contain" /> : app.name[0]}</div>
            <div className="min-w-0 flex-1"><h2 className="truncate font-semibold group-hover:text-sky-700">{app.name}</h2><p className="truncate text-sm text-neutral-500">{app.canonical_host}</p></div>
            <ArrowRight className="h-4 w-4 text-neutral-400 group-hover:text-sky-700" />
          </div>
          <p className="mt-4 line-clamp-2 min-h-10 text-sm text-neutral-600">{app.tagline || app.description || "Explore this launched app."}</p>
          <AppTrustBadges trust={trust.get(app.id)} compact />
          {signals.get(app.id) && <div className="mt-3 rounded-lg bg-sky-50 p-3 text-xs text-sky-900"><strong>{signalLabel(signals.get(app.id)!)}</strong><p className="mt-1">{signalExplanation(signals.get(app.id)!)}</p></div>}
          <div className="mt-4 flex flex-wrap gap-1.5">{app.categories.slice(0, 2).map((item) => <span key={item} className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs text-neutral-600">{item}</span>)}</div>
          </Link>
          <div className="mt-4 flex items-center justify-between gap-2 border-t border-neutral-100 pt-3 text-xs text-neutral-500"><span>{formatDate(app.launched_at) || app.canonical_host}</span><SaveAppButton appId={app.id} saved={savedIds.has(app.id)} onChange={(saved) => setSavedIds((current) => { const next = new Set(current); if (saved) next.add(app.id); else next.delete(app.id); return next; })} /></div>
        </article>)}
      </div>}
      {!error && count > PAGE_SIZE && <div className="mt-8 flex items-center justify-center gap-4"><button disabled={page === 0 || loading} onClick={() => { const next = new URLSearchParams(params); next.set("page", String(page - 1)); setParams(next); }} className="rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm disabled:opacity-40">Previous</button><span className="text-sm text-neutral-500">Page {page + 1} of {Math.ceil(count / PAGE_SIZE)}</span><button disabled={(page + 1) * PAGE_SIZE >= count || loading} onClick={() => { const next = new URLSearchParams(params); next.set("page", String(page + 1)); setParams(next); }} className="rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm disabled:opacity-40">Next</button></div>}
    </main>
    <SiteFooter />
  </div>;
}
