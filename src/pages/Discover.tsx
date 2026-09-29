import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowRight, Search } from "lucide-react";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import { useDocumentMeta } from "@/hooks/useDocumentMeta";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type App = Tables<"public_apps">;
const PAGE_SIZE = 24;
const formatDate = (date: string | null) => date ? new Date(date).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : null;
const safeSearch = (value: string) => value.replace(/[^\p{L}\p{N}\s-]/gu, " ").trim().slice(0, 80);

export default function Discover() {
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState(params.get("q") || "");
  const [apps, setApps] = useState<App[]>([]);
  const [categories, setCategories] = useState<Tables<"public_app_categories">[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const category = params.get("category") || "";
  const platform = params.get("platform") || "";
  const source = params.get("source") || "";
  const sort = params.get("sort") === "discovered" ? "discovered" : "launched";
  const page = Math.max(0, Math.min(Number(params.get("page") || 0) || 0, 1000));
  const search = safeSearch(params.get("q") || "");

  useDocumentMeta({ title: "Discover apps | Rocket", description: "Explore launched apps and find what to build next. Browse real products by category, platform and launch date.", canonical: "https://tryrocket.ai/discover" });

  useEffect(() => {
    supabase.from("public_app_categories").select("category,app_count").order("app_count", { ascending: false }).limit(100)
      .then(({ data }) => { if (data) setCategories(data); });
  }, []);

  useEffect(() => {
    let canceled = false;
    setLoading(true);
    setError(null);
    let request = supabase.from("public_apps").select("*", { count: "exact" });
    if (search) request = request.or(`name.ilike.%${search}%,tagline.ilike.%${search}%,description.ilike.%${search}%`);
    if (category) request = request.contains("categories", [category]);
    if (platform) request = request.contains("platforms", [platform]);
    if (source === "launch") request = request.not("launch_url", "is", null);
    request.order(sort === "discovered" ? "discovered_at" : "launched_at", { ascending: false, nullsFirst: false })
      .order("id", { ascending: true }).range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
      .then(({ data, error: queryError, count: total }) => {
        if (canceled) return;
        setApps(data || []);
        setCount(total || 0);
        setError(queryError ? "The catalogue could not be loaded. Please try again." : null);
        setLoading(false);
      });
    return () => { canceled = true; };
  }, [search, category, platform, source, sort, page]);

  const change = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    next.delete("page");
    setParams(next);
  };

  return <div className="min-h-screen bg-[#f6f8fb] text-neutral-900">
    <SiteHeader />
    <main className="mx-auto max-w-6xl px-6 py-12 sm:py-16">
      <p className="text-sm font-semibold text-sky-600">Rocket Discover</p>
      <h1 className="mt-2 font-display text-4xl tracking-tight sm:text-5xl">Find what to build.</h1>
      <p className="mt-3 max-w-2xl text-neutral-600">Explore real launched products. Sources are identified; revenue and traffic are not verified here.</p>
      <div className="mt-5 flex gap-4 text-sm"><Link to="/apps/add" className="font-semibold text-sky-700 hover:underline">Add app</Link><Link to="/my-apps" className="text-neutral-600 hover:underline">My Apps</Link></div>
      <form className="mt-8 flex max-w-xl gap-2" onSubmit={(event) => { event.preventDefault(); change("q", safeSearch(query)); }}>
        <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-neutral-200 bg-white px-4">
          <Search className="h-4 w-4 text-neutral-400" />
          <input aria-label="Search apps" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search apps or ideas" className="h-11 min-w-0 flex-1 bg-transparent text-sm outline-none" />
        </label>
        <button className="rounded-xl bg-neutral-900 px-5 text-sm font-medium text-white hover:bg-neutral-700">Search</button>
      </form>
      <div className="mt-6 flex flex-wrap gap-3">
        <select aria-label="Category" value={category} onChange={(event) => change("category", event.target.value)} className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm"><option value="">All categories</option>{categories.map((item) => <option key={item.category} value={item.category}>{item.category} ({item.app_count})</option>)}</select>
        <select aria-label="Platform" value={platform} onChange={(event) => change("platform", event.target.value)} className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm"><option value="">All platforms</option><option value="web">Web</option><option value="ios">iOS</option><option value="android">Android</option><option value="hardware">Hardware</option></select>
        <select aria-label="Source" value={source} onChange={(event) => change("source", event.target.value)} className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm"><option value="">All sources</option><option value="launch">Launch</option></select>
        <select aria-label="Order" value={sort} onChange={(event) => change("sort", event.target.value)} className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm"><option value="launched">Newest launches</option><option value="discovered">Recently discovered</option></select>
      </div>
      <div className="mt-8 flex items-center justify-between text-sm text-neutral-500"><span>{loading ? "Loading apps…" : `${count.toLocaleString()} ${count === 1 ? "app" : "apps"}`}</span><span>Source-backed public listings</span></div>
      {error && <div role="alert" className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">{error}</div>}
      {!loading && !error && apps.length === 0 && <div className="mt-6 rounded-xl border border-neutral-200 bg-white p-8 text-neutral-600">No apps match these filters.</div>}
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {apps.map((app) => <Link key={app.id} to={`/apps/${app.id}`} className="group rounded-2xl border border-neutral-200 bg-white p-5 transition hover:border-sky-300 hover:shadow-sm">
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-neutral-100 text-lg font-semibold text-neutral-500">{app.logo_url ? <img src={app.logo_url} alt="" loading="lazy" className="h-full w-full object-contain" /> : app.name[0]}</div>
            <div className="min-w-0 flex-1"><h2 className="truncate font-semibold group-hover:text-sky-700">{app.name}</h2><p className="truncate text-sm text-neutral-500">{app.canonical_host}</p></div>
            <ArrowRight className="h-4 w-4 text-neutral-400 group-hover:text-sky-700" />
          </div>
          <p className="mt-4 line-clamp-2 min-h-10 text-sm text-neutral-600">{app.tagline || app.description || "Explore this launched app."}</p>
          <div className="mt-4 flex flex-wrap gap-1.5">{app.categories.slice(0, 2).map((item) => <span key={item} className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs text-neutral-600">{item}</span>)}</div>
          <div className="mt-4 flex items-center justify-between border-t border-neutral-100 pt-3 text-xs text-neutral-500"><span>{app.launch_url ? "Listed on Launch" : "Public source"} · Unclaimed</span><span>{formatDate(app.launched_at) || "Date unavailable"}</span></div>
        </Link>)}
      </div>
      {!error && count > PAGE_SIZE && <div className="mt-8 flex items-center justify-center gap-4"><button disabled={page === 0 || loading} onClick={() => { const next = new URLSearchParams(params); next.set("page", String(page - 1)); setParams(next); }} className="rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm disabled:opacity-40">Previous</button><span className="text-sm text-neutral-500">Page {page + 1} of {Math.ceil(count / PAGE_SIZE)}</span><button disabled={(page + 1) * PAGE_SIZE >= count || loading} onClick={() => { const next = new URLSearchParams(params); next.set("page", String(page + 1)); setParams(next); }} className="rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm disabled:opacity-40">Next</button></div>}
    </main>
    <SiteFooter />
  </div>;
}
