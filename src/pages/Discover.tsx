import { useEffect, useState } from "react";
import { Link, useSearchParams } from "@/lib/router-compat";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import { useDocumentMeta } from "@/hooks/useDocumentMeta";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { useAuth } from "@/contexts/AuthContext";
import { signalLabel, type AppSignal } from "@/lib/appIntelligence";
import TrendArrow from "@/components/TrendArrow";
import DiscoveryPreview from "@/components/DiscoveryPreview";
import { loadAppMedia, type PublicAppMedia } from "@/lib/appMedia";
import { loadAppCardMetadata, type AppCardMetadata } from "@/lib/appCardMetadata";
import { AppCardSkeleton, RankedAppRowSkeleton } from "@/components/MarketplaceLoadingSkeletons";
import {
  StandardAppCard,
  RankedAppRow,
  MarketplaceListRow,
} from "@/components/MarketplaceCards";
import { track } from "@/lib/analytics";
import { availableCategories } from "@/lib/appCategories";

type App = Tables<"public_apps">;
const PAGE_SIZE = 24;
const RANKING_SIZE = 20;
const safeSearch = (value: string) =>
  value
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .trim()
    .slice(0, 80);

export default function Discover() {
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState(params.get("q") || "");
  const [apps, setApps] = useState<App[]>([]);
  const [categories, setCategories] = useState<
    Tables<"public_app_categories">[]
  >([]);
  const [categorySignals, setCategorySignals] = useState<Tables<"public_category_intelligence">[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [rankingCategories, setRankingCategories] = useState<Tables<"public_ranking_categories">[]>([]);
  const [rankingCategoriesLoading, setRankingCategoriesLoading] = useState(true);
  const [rankingViews, setRankingViews] = useState<Map<string, number>>(new Map());
  const [signals, setSignals] = useState<Map<string, AppSignal>>(new Map());
  const [media, setMedia] = useState<Map<string, PublicAppMedia[]>>(new Map());
  const [cardMetadata, setCardMetadata] = useState<Map<string, AppCardMetadata>>(new Map());
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const { user } = useAuth();
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const category = params.get("category") || "";
  const platform = params.get("platform") || "";
  const source = params.get("source") || "";
  const sort = params.get("sort") === "discovered" ? "discovered" : "launched";
  const page = Math.max(
    0,
    Math.min(Number(params.get("page") || 0) || 0, 1000),
  );
  const rawSearch = params.get("q") || "";
  const search = safeSearch(rawSearch);
  const view = ["rising", "rankings", "new", "categories", "all"].includes(
    params.get("view") || "",
  )
    ? params.get("view") === "rising" ? "rankings" : params.get("view")!
    : "all";
  const pageTitle = view === "rankings" ? "Rankings" : view === "new" ? "New" : view === "categories" ? "Categories" : "Discover";
  const showOverview =
    !params.get("view") &&
    !search &&
    !category &&
    !platform &&
    !source &&
    page === 0;

  useEffect(() => {
    setQuery(rawSearch);
  }, [rawSearch]);

  useDocumentMeta({
    title: `${pageTitle} | Rocket`,
    description:
      "Discover apps worth using, including new software from vibe coders and developers. Browse by category, platform and launch date.",
    canonical: "https://tryrocket.ai/discover",
  });

  useEffect(() => {
    Promise.resolve(supabase
      .from("public_app_categories")
      .select("category,app_count")
      .order("app_count", { ascending: false })
      .limit(100))
      .then(({ data }) => {
        if (data) setCategories(data);
      })
      .finally(() => setCategoriesLoading(false));
    supabase.from("public_category_intelligence").select("*")
      .order("launch_volume_change_pct", { ascending: false }).limit(20)
      .then(({ data }) => { if (data) setCategorySignals(data); });
    Promise.resolve(supabase
      .from("public_ranking_categories")
      .select("category,app_count")
      .order("app_count", { ascending: false }))
      .then(({ data }) => {
        if (data) setRankingCategories(data);
      })
      .finally(() => setRankingCategoriesLoading(false));
  }, []);

  useEffect(() => {
    let canceled = false;
    setLoading(true);
    setError(null);
    const load = async () => {
      if (view === "categories") {
        setApps([]);
        setCount(0);
        setLoading(false);
        return;
      }
      if (view === "rankings") {
        if (rankingCategoriesLoading) return;
        const eligibleCategory = rankingCategories.some((item) => item.category === category) ? category : "";
        let request = supabase
          .from("public_app_rankings")
          .select("app_id,rocket_view_count,last_viewed_at")
          .order("rocket_view_count", { ascending: false })
          .order("last_viewed_at", { ascending: false, nullsFirst: false })
          .order("launched_at", { ascending: false, nullsFirst: false })
          .order("app_id", { ascending: true })
          .limit(RANKING_SIZE);
        if (eligibleCategory) request = request.contains("categories", [eligibleCategory]);
        const { data: rankingRows, error: rankingError } = await request;
        if (rankingError) throw rankingError;
        const ids = (rankingRows || []).map((row) => row.app_id);
        const appResult = ids.length
          ? await supabase.from("public_discoverable_apps").select("*").in("id", ids)
          : { data: [] as App[], error: null };
        if (appResult.error) throw appResult.error;
        const byId = new Map((appResult.data || []).map((app) => [app.id, app]));
        if (!canceled) {
          setApps(ids.map((id) => byId.get(id)).filter((app): app is App => Boolean(app)));
          setRankingViews(new Map((rankingRows || []).map((row) => [row.app_id, row.rocket_view_count])));
          setSignals(new Map());
          setCount(ids.length);
          setMedia(new Map());
        }
      } else if (view === "new") {
        const {
          data: signalRows,
          count: total,
          error: signalError,
        } = await supabase
          .from("public_discoverable_app_intelligence")
          .select("*", { count: "exact" })
          .eq("signal_type", "new_interesting")
          .order("percentile_rank", { ascending: false })
          .order("net_votes", { ascending: false })
          .order("app_id", { ascending: true })
          .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
        if (signalError) throw signalError;
        const ids = (signalRows || []).map((row) => row.app_id);
        const [appResult, mediaResult] = ids.length
          ? await Promise.all([
              supabase
                .from("public_discoverable_apps")
                .select("*")
                .in("id", ids),
              loadAppMedia(ids),
            ])
          : [
              { data: [] as App[], error: null },
              new Map<string, PublicAppMedia[]>(),
            ];
        if (appResult.error) throw appResult.error;
        const byId = new Map(
          (appResult.data || []).map((app) => [app.id, app]),
        );
        if (!canceled) {
          setApps(
            ids
              .map((id) => byId.get(id))
              .filter((app): app is App => Boolean(app)),
          );
          setSignals(
            new Map((signalRows || []).map((row) => [row.app_id, row])),
          );
          setMedia(mediaResult);
          setCount(total || 0);
        }
      } else {
        let request = supabase
          .from(search ? "public_apps" : "public_discoverable_apps")
          .select("*", { count: "exact" });
        if (search)
          request = request.or(
            `name.ilike.%${search}%,tagline.ilike.%${search}%,description.ilike.%${search}%`,
          );
        if (category) request = request.contains("categories", [category]);
        if (platform) request = request.contains("platforms", [platform]);
        if (source === "launch")
          request = request.not("launch_url", "is", null);
        const {
          data,
          error: queryError,
          count: total,
        } = await request
          .order(sort === "discovered" ? "discovered_at" : "launched_at", {
            ascending: false,
            nullsFirst: false,
          })
          .order("id", { ascending: true })
          .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
        if (queryError) throw queryError;
        const ids = (data || []).map((app) => app.id);
        const [evidence, mediaResult] = ids.length
          ? await Promise.all([
              supabase
                .from("public_app_intelligence")
                .select("*")
                .in("app_id", ids),
              loadAppMedia(ids),
            ])
          : [{ data: [] as AppSignal[] }, new Map<string, PublicAppMedia[]>()];
        if (!canceled) {
          setApps(data || []);
          setCount(total || 0);
          setSignals(
            new Map(
              (evidence.data || [])
                .filter((row) => row.signal_type === "rising")
                .map((row) => [row.app_id, row]),
            ),
          );
          setMedia(mediaResult);
        }
      }
      if (!canceled) setLoading(false);
    };
    load().catch(() => {
      if (!canceled) {
        setError("The catalogue could not be loaded. Please try again.");
        setLoading(false);
      }
    });
    return () => {
      canceled = true;
    };
  }, [search, category, platform, source, sort, page, view, rankingCategories, rankingCategoriesLoading]);

  useEffect(() => {
    if (!user || apps.length === 0) {
      setSavedIds(new Set());
      return;
    }
    let canceled = false;
    supabase
      .from("saved_apps")
      .select("app_id")
      .eq("user_id", user.id)
      .in(
        "app_id",
        apps.map((app) => app.id),
      )
      .then(({ data }) => {
        if (!canceled)
          setSavedIds(new Set((data || []).map((row) => row.app_id)));
      });
    return () => {
      canceled = true;
    };
  }, [user, apps]);

  useEffect(() => {
    let canceled = false;
    loadAppCardMetadata(apps.map((app) => app.id)).then((result) => {
      if (!canceled) setCardMetadata(result);
    });
    return () => { canceled = true; };
  }, [apps]);

  const change = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "view") next.set("view", "all");
    if (key === "view" && value !== "all") {
      for (const filter of ["q", "category", "platform", "source", "sort"])
        next.delete(filter);
      setQuery("");
    }
    next.delete("page");
    setParams(next);
  };
  const selectRankingCategory = (value: string) => {
    const next = new URLSearchParams();
    next.set("view", "rankings");
    if (value) next.set("category", value);
    track("discovery_category_selected", { category: value || "all", view: "rankings" });
    setParams(next);
  };
  const activeRankingCategory = rankingCategories.some((item) => item.category === category) ? category : "";
  const discoverCategories = availableCategories(categories.map((item) => item.category));

  return (
    <div className="marketplace-page min-h-screen bg-[#f6f8fb] text-neutral-900">
      <SiteHeader />
      <main className="mx-auto max-w-[90rem] px-5 pb-20 pt-6 sm:px-8 sm:pt-8">
        <h1 className="text-3xl font-bold tracking-[-.045em] sm:text-4xl">
          {pageTitle}
        </h1>
        <p className="mt-1 text-sm text-neutral-600">
          Apps worth using, from new arrivals to category rankings.
        </p>
        <form
          role="search"
          className="mt-5 flex w-full max-w-3xl gap-2 rounded-xl border border-neutral-200 bg-white p-1.5 focus-within:border-sky-500 focus-within:ring-2 focus-within:ring-sky-200"
          onSubmit={(event) => {
            event.preventDefault();
            track("discovery_search", {
              source: "discover",
              has_query: Boolean(safeSearch(query)),
            });
            change("q", safeSearch(query));
          }}
        >
          <span className="my-auto ml-3 text-lg" aria-hidden="true">🔎</span>
          <input
            id="search-apps"
            aria-label="Search apps"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search apps, tools, or ideas"
            className="min-w-0 flex-1 bg-transparent px-1 text-base outline-hidden"
          />
          <button className="min-h-11 rounded-xl bg-[#167ac6] px-4 text-sm font-semibold text-white hover:bg-[#1268aa] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-sky-500">
            Search
          </button>
        </form>
        <div className="mt-5 flex items-center justify-between gap-3 border-b border-neutral-200 pb-3">
        <nav
          aria-label="Discover sections"
          className="flex min-w-0 gap-2 overflow-x-auto [scrollbar-width:none]"
        >
          {(
            [
              ["rankings", "Rankings"],
              ["new", "New"],
              ["categories", "Categories"],
              ["all", "All Apps"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => {
                track("discovery_view_selected", { view: key });
                change("view", key);
              }}
              aria-current={view === key ? "page" : undefined}
              className={`shrink-0 rounded-xl px-4 py-2 text-sm font-medium transition-colors ${view === key ? "bg-neutral-200 text-neutral-900" : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-950"}`}
            >
              {label}
            </button>
          ))}
        </nav>
        {view !== "rankings" && (
          <label className="flex shrink-0 items-center gap-2 text-sm font-medium text-neutral-600">
            <span className="hidden sm:inline">Platform</span>
            <select
              aria-label="Browse by platform"
              value={platform}
              onChange={(event) => change("platform", event.target.value)}
              className="min-h-10 rounded-xl border border-neutral-200 bg-white px-3 text-sm text-neutral-900 focus-visible:outline-2 focus-visible:outline-[#167ac6]"
            >
              <option value="">All platforms</option>
              <option value="web">Web</option>
              <option value="ios">iOS</option>
              <option value="android">Android</option>
              <option value="hardware">Hardware</option>
            </select>
          </label>
        )}
        </div>
        {view === "rankings" && (
          <section className="mt-6" aria-labelledby="ranking-categories-heading">
            <h2 id="ranking-categories-heading" className="text-lg font-bold">Top 20 by Rocket views</h2>
            <p className="mt-1 text-sm text-neutral-600">Visits to app profiles on Rocket since view tracking began. Repeat visits from the same browser/network to an app in a day count once; ties use the most recent view, then newer listings. Views are not verified users, revenue or a Rocket endorsement.</p>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3" aria-label="Ranking categories">
              <button onClick={() => selectRankingCategory("")} aria-current={!activeRankingCategory ? "page" : undefined} className={`flex min-h-12 items-center gap-3 rounded-xl px-4 text-left text-sm font-medium ${!activeRankingCategory ? "bg-neutral-200 text-neutral-900" : "bg-white text-neutral-700 hover:bg-neutral-100"}`}>
                All Apps
              </button>
              {rankingCategories.map((item) => (
                <button key={item.category} onClick={() => selectRankingCategory(item.category)} aria-current={activeRankingCategory === item.category ? "page" : undefined} className={`flex min-h-12 items-center gap-3 rounded-xl px-4 text-left text-sm font-medium ${activeRankingCategory === item.category ? "bg-neutral-200 text-neutral-900" : "bg-white text-neutral-700 hover:bg-neutral-100"}`}>
                  <span className="min-w-0 truncate">{item.category}</span>
                </button>
              ))}
            </div>
          </section>
        )}
        {view !== "rankings" && (
          <div className="mt-3 flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
            {categories.length > 0 && (
              <nav
                aria-label="Browse categories"
                className="flex min-w-0 gap-2 overflow-x-auto pb-2 [scrollbar-width:none] sm:flex-1"
              >
                <button
                  onClick={() => change("category", "")}
                  aria-current={!category ? "page" : undefined}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium ${!category ? "bg-neutral-200 text-neutral-900" : "bg-white text-neutral-600 hover:text-neutral-950"}`}
                >
                  All categories
                </button>
                {categories.slice(0, 12).map((item) => (
                  <button
                    key={item.category}
                    onClick={() => {
                      track("discovery_category_selected", {
                        category: item.category,
                      });
                      change("category", item.category);
                    }}
                    aria-current={category === item.category ? "page" : undefined}
                    className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium ${category === item.category ? "bg-neutral-200 text-neutral-900" : "bg-white text-neutral-600 hover:text-neutral-950"}`}
                  >
                    {item.category}
                  </button>
                ))}
              </nav>
            )}
          </div>
        )}
        {showOverview && <DiscoveryPreview />}
        {view === "all" && (
          <details
            className="mt-6 border-b border-neutral-200 pb-4"
            open
          >
            <summary className="cursor-pointer text-sm font-semibold text-neutral-700">
              Filters and sorting
            </summary>
            <div className="mt-4 flex flex-wrap gap-3">
              <select
                aria-label="Category"
                value={category}
                onChange={(event) => {
                  track("discovery_category_selected", {
                    category: event.target.value || "all",
                  });
                  change("category", event.target.value);
                }}
                className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm"
              >
                <option value="">All categories</option>
                {categories.map((item) => (
                  <option key={item.category} value={item.category}>
                    {item.category} ({item.app_count})
                  </option>
                ))}
              </select>
              <select
                aria-label="Source"
                value={source}
                onChange={(event) => change("source", event.target.value)}
                className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm"
              >
                <option value="">All sources</option>
                <option value="launch">Launch</option>
              </select>
              <select
                aria-label="Order"
                value={sort}
                onChange={(event) => change("sort", event.target.value)}
                className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm"
              >
                <option value="launched">Newest launches</option>
                <option value="discovered">Recently discovered</option>
              </select>
            </div>
          </details>
        )}
        <div className="mt-6 flex items-center justify-between text-sm text-neutral-500">
          <span>
            {loading || (view === "categories" && categoriesLoading)
              ? <span className="inline-block h-4 w-24 animate-pulse rounded bg-neutral-200 align-middle dark:bg-neutral-800" role="status" aria-label="Loading app count" />
              : view === "categories"
                ? `${discoverCategories.length} categories`
                : view === "rankings"
                  ? `Top ${count} apps`
                : `${count.toLocaleString()} ${count === 1 ? "app" : "apps"}`}
          </span>
          <span>{view === "all" ? "All Apps" : view === "rankings" ? "Ranked by Rocket app-profile views" : "Public Launch activity"}</span>
        </div>
        {error && (
          <div
            role="alert"
            className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700"
          >
            {error}
          </div>
        )}
        {!loading && !error && view !== "categories" && apps.length === 0 && (
          <div className="mt-6 rounded-xl border border-neutral-200 bg-white p-8 text-neutral-600">
            {view === "all"
              ? "No apps match these filters."
              : "No apps currently meet this evidence threshold. Browse all apps instead."}
          </div>
        )}
        {view === "categories" && !loading && categoriesLoading && (
          <div
            className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
            role="status"
            aria-label="Loading categories"
          >
            {[0, 1, 2].map((item) => (
              <div
                key={item}
                className="rocket-skeleton-surface h-40 animate-pulse rounded-2xl border border-neutral-200 p-5"
              >
                <div className="h-5 w-2/3 rounded bg-neutral-100" />
                <div className="mt-6 h-3 w-full rounded bg-neutral-100" />
              </div>
            ))}
          </div>
        )}
        {view === "categories" && !loading && !categoriesLoading && !error && (
          <div className="mt-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {discoverCategories.map((name) => {
              const appCount = categories.find((row) => row.category === name)?.app_count || 0;
              return (
              <button
                key={name}
                disabled={appCount === 0}
                onClick={() => {
                  track("discovery_category_selected", {
                    category: name,
                  });
                  const next = new URLSearchParams(params);
                  next.set("view", "all");
                  next.set("category", name);
                  next.delete("page");
                  setParams(next);
                }}
                className="rounded-2xl border border-neutral-200 bg-white p-5 text-left hover:border-sky-300 disabled:cursor-default disabled:opacity-55 disabled:hover:border-neutral-200"
              >
                <h2 className="mt-3 font-semibold">{name}</h2>
                <p className="mt-2 text-sm text-neutral-600">{appCount ? `${appCount.toLocaleString()} apps` : "No listings yet"}</p>
              </button>
            );})}
            </div>
            {categorySignals.length > 0 && <section className="mt-10" aria-labelledby="category-activity-heading">
              <h2 id="category-activity-heading" className="text-xl font-bold">Recent Launch activity by category</h2>
              <p className="mt-1 text-sm text-neutral-600">Observed founder activity, not verified customer demand.</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {categorySignals.map((item) => <div key={item.category} className="rounded-xl border border-neutral-200 bg-white p-4">
                  <h3 className="font-semibold">{item.category}</h3>
                  <p className="mt-2 text-sm text-neutral-600">{item.recent_launches} Launch products in the last 30 days vs {item.previous_launches} in the preceding 30 days.</p>
                  <p className="mt-1 flex items-center gap-1 text-xs text-neutral-500">
                    {item.launch_volume_change_pct !== 0 && <TrendArrow direction={item.launch_volume_change_pct! > 0 ? "up" : "down"} />}
                    {item.launch_volume_change_pct! > 0 ? "+" : ""}{item.launch_volume_change_pct}% launch activity
                  </p>
                </div>)}
              </div>
            </section>}
          </div>
        )}
        {view !== "categories" && loading && (
          <div
            className={`mt-4 grid gap-4 ${view === "new" ? "sm:grid-cols-2 lg:grid-cols-3" : "sm:grid-cols-2"}`}
            role="status"
            aria-label="Loading apps"
            aria-busy="true"
          >
            {Array.from({ length: view === "rankings" ? RANKING_SIZE : 6 }, (_, item) =>
              view === "new" ? <AppCardSkeleton key={item} /> : <RankedAppRowSkeleton key={item} />
            )}
          </div>
        )}
        {view !== "categories" &&
          !loading &&
          !error &&
          (view === "rankings" ? (
            <div className="mt-3 grid gap-x-7 sm:grid-cols-2">
              {apps.map((app, index) => (
                <RankedAppRow
                  key={app.id}
                  app={app}
                  metadata={cardMetadata.get(app.id)}
                  rank={index + 1}
                  eyebrow={`${rankingViews.get(app.id)?.toLocaleString() || "0"} Rocket views`}
                />
              ))}
            </div>
          ) : view === "new" ? (
            <div className="mt-4 grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {apps.map((app) => (
                <StandardAppCard
                  key={app.id}
                  app={app}
                  metadata={cardMetadata.get(app.id)}
                  media={media.get(app.id)}
                  eyebrow={
                    signals.get(app.id)
                      ? signalLabel(signals.get(app.id)!)
                      : undefined
                  }
                  trend={signals.get(app.id)?.signal_type === "rising" ? "up" : undefined}
                  saved={savedIds.has(app.id)}
                  onSave={(saved) =>
                    setSavedIds((current) => {
                      const next = new Set(current);
                      if (saved) next.add(app.id);
                      else next.delete(app.id);
                      return next;
                    })
                  }
                />
              ))}
            </div>
          ) : (
            <div className="mt-3 grid min-w-0 gap-x-8 md:grid-cols-2">
              {apps.map((app) => (
                <MarketplaceListRow
                  key={app.id}
                  app={app}
                  metadata={cardMetadata.get(app.id)}
                />
              ))}
            </div>
          ))}
        {!error && view !== "rankings" && count > PAGE_SIZE && (
          <div className="mt-8 flex items-center justify-center gap-4">
            <button
              disabled={page === 0 || loading}
              onClick={() => {
                const next = new URLSearchParams(params);
                next.set("page", String(page - 1));
                setParams(next);
              }}
              className="rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm disabled:opacity-40"
            >
              Previous
            </button>
            <span className="text-sm text-neutral-500">
              Page {page + 1} of {Math.ceil(count / PAGE_SIZE)}
            </span>
            <button
              disabled={(page + 1) * PAGE_SIZE >= count || loading}
              onClick={() => {
                const next = new URLSearchParams(params);
                next.set("page", String(page + 1));
                setParams(next);
              }}
              className="rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm disabled:opacity-40"
            >
              Next
            </button>
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
