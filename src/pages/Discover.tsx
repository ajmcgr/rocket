import { useEffect, useState } from "react";
import { Link, useSearchParams } from "@/lib/router-compat";
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
import AppLogo from "@/components/AppLogo";
import { track } from "@/lib/analytics";

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
  const [categoriesLoading, setCategoriesLoading] = useState(true);
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

  useDocumentMeta({ title: "Discover apps | Rocket", description: "Discover independent apps worth using. Browse real products by category, platform and launch date.", canonical: "https://tryrocket.ai/discover" });

  useEffect(() => {
    supabase.from("public_app_categories").select("category,app_count").order("app_count", { ascending: false }).limit(100)
      .then(({ data }) => { if (data) setCategories(data); });
    Promise.resolve(
      supabase.from("public_category_intelligence").select("*")
        .order("launch_volume_change_pct", { ascending: false }).limit(20),
    ).then(({ data }) => { if (data) setCategorySignals(data); })
      .finally(() => setCategoriesLoading(false));
  }, []);

  useEffect(() => {
    let canceled = false;
    setLoading(true);
    setError(null);
    const load = async () => {
      if (view === "categories") { setApps([]); setTrust(new Map()); setCount(0); setLoading(false); return; }
      if (view === "rising" || view === "new") {
        const { data: signalRows, count: total, error: signalError } = await supabase
          .from("public_discoverable_app_intelligence").select("*", { count: "exact" })
          .eq("signal_type", view === "rising" ? "rising" : "new_interesting")
          .order("percentile_rank", { ascending: false }).order("net_votes", { ascending: false })
          .order("app_id", { ascending: true }).range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
        if (signalError) throw signalError;
        const ids = (signalRows || []).map((row) => row.app_id);
        const [appResult, trustResult] = ids.length ? await Promise.all([
          supabase.from("public_discoverable_apps").select("*").in("id", ids),
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
        let request = supabase.from(search ? "public_apps" : "public_discoverable_apps").select("*", { count: "exact" });
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
  }, [search, category, platform, source, sort, page, view]);

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
      <form role="search" className="mt-8 flex w-full max-w-3xl gap-2 rounded-2xl border border-neutral-200 bg-white p-2 shadow-[0_14px_42px_-28px_rgba(15,23,42,0.3)] focus-within:border-sky-500 focus-within:ring-2 focus-within:ring-sky-200" onSubmit={(event) => { event.preventDefault(); track("discovery_search", { source: "discover", has_query: Boolean(safeSearch(query)) }); change("q", safeSearch(query)); }}>
        <Search className="my-auto ml-3 h-5 w-5 shrink-0 text-neutral-400" aria-hidden="true" />
        <input aria-label="Search apps" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search apps, tools, or ideas" className="min-w-0 flex-1 bg-transparent px-1 text-base outline-hidden" />
        <button className="min-h-11 rounded-xl bg-neutral-900 px-4 text-sm font-semibold text-white hover:bg-neutral-700 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-sky-500">Search</button>
      </form>
      <nav aria-label="Discover sections" className="mt-7 flex flex-wrap gap-2">
        {([ ["rising", "Rising"], ["new", "New"], ["categories", "Categories"], ["all", "All Apps"] ] as const).map(([key, label]) =>
          <button key={key} onClick={() => { track("discovery_view_selected", { view: key }); change("view", key); }} aria-current={view === key ? "page" : undefined}
            className={`rounded-full px-4 py-2 text-sm ${view === key ? "bg-neutral-900 text-white" : "border border-neutral-200 bg-white text-neutral-700 hover:border-sky-300"}`}>{label}</button>)}
      </nav>
      {showOverview && <DiscoveryPreview />}
      {view === "all" && <details className="mt-9 rounded-xl border border-neutral-200 bg-white p-4" open={Boolean(search || category || platform || source || params.get("sort"))}>
        <summary className="cursor-pointer text-sm font-semibold text-neutral-700">Filters and sorting</summary>
      <div className="mt-4 flex flex-wrap gap-3">
        <select aria-label="Category" value={category} onChange={(event) => { track("discovery_category_selected", { category: event.target.value || "all" }); change("category", event.target.value); }} className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm"><option value="">All categories</option>{categories.map((item) => <option key={item.category} value={item.category}>{item.category} ({item.app_count})</option>)}</select>
        <select aria-label="Platform" value={platform} onChange={(event) => change("platform", event.target.value)} className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm"><option value="">All platforms</option><option value="web">Web</option><option value="ios">iOS</option><option value="android">Android</option><option value="hardware">Hardware</option></select>
        <select aria-label="Source" value={source} onChange={(event) => change("source", event.target.value)} className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm"><option value="">All sources</option><option value="launch">Launch</option></select>
        <select aria-label="Order" value={sort} onChange={(event) => change("sort", event.target.value)} className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm"><option value="launched">Newest launches</option><option value="discovered">Recently discovered</option></select>
      </div>
      </details>}
      <div className="mt-9 flex items-center justify-between text-sm text-neutral-500"><span>{loading || (view === "categories" && categoriesLoading) ? "Loading apps…" : view === "categories" ? `${categorySignals.length} categories` : `${count.toLocaleString()} ${count === 1 ? "app" : "apps"}`}</span><span>{view === "all" ? "All Apps" : "Public Launch activity"}</span></div>
      {error && <div role="alert" className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">{error}</div>}
      {!loading && !error && view !== "categories" && apps.length === 0 && <div className="mt-6 rounded-xl border border-neutral-200 bg-white p-8 text-neutral-600">{view === "all" ? "No apps match these filters." : "No apps currently meet this evidence threshold. Browse all apps instead."}</div>}
      {view === "categories" && !loading && categoriesLoading && <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" role="status" aria-label="Loading categories">{[0, 1, 2].map((item) => <div key={item} className="h-40 animate-pulse rounded-2xl border border-neutral-200 bg-white p-5"><div className="h-5 w-2/3 rounded bg-neutral-100" /><div className="mt-6 h-3 w-full rounded bg-neutral-100" /></div>)}</div>}
      {view === "categories" && !loading && !categoriesLoading && !error && <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{categorySignals.map((item) =>
        <button key={item.category} onClick={() => { track("discovery_category_selected", { category: item.category }); const next = new URLSearchParams(params); next.set("view", "all"); next.set("category", item.category); next.delete("page"); setParams(next); }}
          className="rounded-2xl border border-neutral-200 bg-white p-5 text-left hover:border-sky-300">
          <h2 className="font-semibold">{item.category}</h2>
          <p className="mt-3 text-sm text-neutral-700">{item.recent_launches} Launch products in the last 30 days vs {item.previous_launches} in the preceding 30 days.</p>
          <p className="mt-2 text-sm text-neutral-600">{item.launch_volume_change_pct! >= 0 ? "+" : ""}{item.launch_volume_change_pct}% launch activity · {item.recent_catalogue_share_pct}% of recent Rocket listings</p>
          <p className="mt-3 text-xs text-neutral-500">Observed founder activity, not customer demand · Updated {formatDate(item.calculated_at)}</p>
        </button>)}</div>}
      {view !== "categories" && loading && <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" role="status" aria-label="Loading apps">{[0, 1, 2, 3, 4, 5].map((item) => <div key={item} className="h-60 animate-pulse rounded-[1.5rem] border border-neutral-200 bg-white p-5"><div className="h-14 w-14 rounded-2xl bg-neutral-100" /><div className="mt-6 h-4 w-2/3 rounded bg-neutral-100" /><div className="mt-3 h-3 w-4/5 rounded bg-neutral-100" /></div>)}</div>}
      {view !== "categories" && !loading && !error && <div className="mt-4 grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {apps.map((app) => <article key={app.id} className="group flex min-w-0 min-h-60 flex-col rounded-[1.5rem] border border-neutral-200 bg-white p-5 shadow-[0_14px_36px_-34px_rgba(15,23,42,0.4)] transition hover:-translate-y-0.5 hover:border-sky-300 hover:shadow-[0_18px_38px_-30px_rgba(15,23,42,0.28)]">
          <Link to={`/apps/${app.id}`} className="flex flex-1 flex-col rounded-lg focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-sky-500" aria-label={`View ${app.name}`}>
            <div className="flex items-start gap-3"><AppLogo name={app.name} src={app.logo_url} className="h-14 w-14" /><div className="min-w-0 flex-1"><h2 className="line-clamp-1 text-base font-semibold text-neutral-950 group-hover:text-sky-800">{app.name}</h2><p className="truncate text-sm text-neutral-500">{app.canonical_host}</p></div><ArrowRight className="h-4 w-4 text-neutral-400 transition group-hover:text-sky-800" aria-hidden="true" /></div>
            <p className="mt-4 line-clamp-2 min-h-10 text-sm leading-relaxed text-neutral-600">{app.tagline || app.description || "Explore this app."}</p>
            <div className="mt-auto flex items-center gap-2 pt-4"><span className="truncate text-xs text-neutral-500">{app.categories[0] || app.canonical_host}</span><AppTrustBadges trust={trust.get(app.id)} compact /></div>
          </Link>
          {signals.get(app.id) && <details className="mt-3 text-xs text-sky-900"><summary className="cursor-pointer font-medium focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-sky-500">{signalLabel(signals.get(app.id)!)}</summary><p className="mt-2 leading-relaxed text-neutral-600">{signalExplanation(signals.get(app.id)!)}</p></details>}
          <div className="mt-4 flex items-center justify-between gap-2 border-t border-neutral-100 pt-3 text-xs text-neutral-500"><span>{formatDate(app.launched_at) || app.canonical_host}</span><SaveAppButton appId={app.id} saved={savedIds.has(app.id)} onChange={(saved) => setSavedIds((current) => { const next = new Set(current); if (saved) next.add(app.id); else next.delete(app.id); return next; })} /></div>
        </article>)}
      </div>}
      {!error && count > PAGE_SIZE && <div className="mt-8 flex items-center justify-center gap-4"><button disabled={page === 0 || loading} onClick={() => { const next = new URLSearchParams(params); next.set("page", String(page - 1)); setParams(next); }} className="rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm disabled:opacity-40">Previous</button><span className="text-sm text-neutral-500">Page {page + 1} of {Math.ceil(count / PAGE_SIZE)}</span><button disabled={(page + 1) * PAGE_SIZE >= count || loading} onClick={() => { const next = new URLSearchParams(params); next.set("page", String(page + 1)); setParams(next); }} className="rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm disabled:opacity-40">Next</button></div>}
    </main>
    <SiteFooter />
  </div>;
}
