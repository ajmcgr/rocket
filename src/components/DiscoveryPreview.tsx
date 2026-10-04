import { useEffect, useState, type ReactNode } from "react";
import { Link } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { coverMedia, loadAppMedia, type PublicAppMedia } from "@/lib/appMedia";
import { loadAppCardMetadata, type AppCardMetadata } from "@/lib/appCardMetadata";
import { publicMarketplaceRead } from "@/lib/publicMarketplaceCache";
import { AppCardSkeleton, RankedAppRowSkeleton } from "@/components/MarketplaceLoadingSkeletons";
import { useSavedAppControls } from "@/hooks/useSavedAppControls";
import {
  EditorialAppCard,
  StandardAppCard,
  RankedAppRow,
} from "./MarketplaceCards";

type App = Tables<"public_apps">;
type Signal = Tables<"public_app_intelligence">;
type Category = Tables<"public_app_categories">;
type Preview = { app: App; signal: Signal };
const categoryGradients = [
  "rocket-category-ocean",
  "rocket-category-orchid",
  "rocket-category-citrus",
  "rocket-category-sunset",
  "rocket-category-lagoon",
  "rocket-category-coral",
  "rocket-category-lime",
  "rocket-category-indigo",
] as const;

function SectionHeading({ id, title, description, href, action, emoji }: {
  id: string;
  title: string;
  description: string;
  href: string;
  action: string;
  emoji: string;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-4 border-b border-neutral-200 pb-4">
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center text-2xl leading-none" aria-hidden="true">
          {emoji}
        </span>
        <div>
          <h2 id={id} className="text-2xl font-bold tracking-tight text-neutral-950 sm:text-3xl">{title}</h2>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-neutral-600">{description}</p>
        </div>
      </div>
      <Link to={href} className="inline-flex items-center gap-1.5 pb-0.5 text-sm font-semibold text-sky-800 hover:underline">
        {action} <span aria-hidden="true">→</span>
      </Link>
    </div>
  );
}

export default function DiscoveryPreview({ intro }: { intro?: ReactNode }) {
  const [rankings, setRankings] = useState<App[]>([]);
  const [rankingViews, setRankingViews] = useState<Map<string, number>>(new Map());
  const [fresh, setFresh] = useState<Preview[]>([]);
  const saveControls = useSavedAppControls([...rankings.map((app) => app.id), ...fresh.map(({ app }) => app.id)]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [media, setMedia] = useState<Map<string, PublicAppMedia[]>>(new Map());
  const [metadata, setMetadata] = useState<Map<string, AppCardMetadata>>(new Map());
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [mediaLoading, setMediaLoading] = useState(true);
  useEffect(() => {
    let active = true;
    const load = async () => {
      const [rankingResult, newResult, categoryResult] = await Promise.all([
        publicMarketplaceRead("preview", "rankings-top20", () => supabase
          .from("public_app_rankings")
          .select("app_id,rocket_view_count")
          .order("rocket_view_count", { ascending: false })
          .order("last_viewed_at", { ascending: false, nullsFirst: false })
          .order("launched_at", { ascending: false, nullsFirst: false })
          .order("app_id", { ascending: true })
          .limit(20)),
        publicMarketplaceRead("preview", "new", () => supabase
          .from("public_discoverable_app_intelligence")
          .select("*")
          .eq("signal_type", "new_interesting")
          .order("percentile_rank", { ascending: false })
          .order("net_votes", { ascending: false })
          .limit(4)),
        publicMarketplaceRead("categories", "home", () => supabase
          .from("public_app_categories")
          .select("category,app_count")
          .order("app_count", { ascending: false })
          .limit(8)),
      ]);
      // Each rail is optional: a failed rankings query must not hide New or Categories.
      if (rankingResult.error && newResult.error && categoryResult.error)
        throw rankingResult.error;
      const rankingRows = rankingResult.error ? [] : rankingResult.data || [];
      const freshSignals = newResult.error ? [] : newResult.data || [];
      const ids = [
        ...new Set(
          [...rankingRows, ...freshSignals].map((signal) => signal.app_id),
        ),
      ];
      // Start enrichment together, but do not make core cards wait for it.
      const mediaPromise = loadAppMedia(ids);
      const metadataPromise = loadAppCardMetadata(ids);
      const appResult = await (ids.length
          ? publicMarketplaceRead("preview", ids.join(","), () => supabase.from("public_discoverable_apps").select("*").in("id", ids))
          : Promise.resolve({ data: [] as App[] }));
      if (!active) return;
      const apps = new Map((appResult.data || []).map((app) => [app.id, app]));
      const mapRows = (signals: Signal[]) =>
        signals.flatMap((signal) => {
          const app = apps.get(signal.app_id);
          return app ? [{ app, signal }] : [];
        });
      setRankings(rankingRows.flatMap((row) => apps.get(row.app_id) ? [apps.get(row.app_id)!] : []));
      setRankingViews(new Map(rankingRows.map((row) => [row.app_id, row.rocket_view_count])));
      setFresh(mapRows(freshSignals));
      setCategories(categoryResult.error ? [] : categoryResult.data || []);
      setLoading(false);
      void mediaPromise.then((result) => {
        if (active) { setMedia(result); setMediaLoading(false); }
      }).catch(() => { if (active) setMediaLoading(false); });
      void metadataPromise.then((result) => { if (active) setMetadata(result); }).catch(() => undefined);
    };
    load().catch(() => {
      if (active) {
        setFailed(true);
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, []);
  if (loading)
    return (
      <div className={intro ? "pt-6 lg:pt-10" : ""}>
        <div className="mx-auto max-w-4xl">{intro}</div>
        <div role="status" aria-label="Finding apps worth exploring" aria-busy="true" className="mt-6 space-y-10">
          {intro && <div className="rocket-skeleton-surface mx-auto h-[22rem] max-w-4xl animate-pulse rounded-2xl border border-neutral-200 bg-neutral-100" aria-hidden="true" />}
          <section aria-hidden="true">
            <div className="rocket-skeleton-surface mb-5 flex items-end justify-between border-b border-neutral-200 pb-4">
              <div className="h-8 w-40 animate-pulse rounded-lg bg-neutral-100" />
              <div className="h-4 w-28 animate-pulse rounded-lg bg-neutral-100" />
            </div>
            <div className="grid gap-x-7 sm:grid-cols-2">
              {Array.from({ length: 20 }, (_, item) => <RankedAppRowSkeleton key={item} />)}
            </div>
          </section>
          <section aria-hidden="true">
            <div className="rocket-skeleton-surface mb-5 h-8 w-28 animate-pulse rounded-lg bg-neutral-100" />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[0, 1, 2, 3].map((item) => <AppCardSkeleton key={item} />)}
            </div>
          </section>
        </div>
      </div>
    );
  if (failed)
    return (
      <div
        role="status"
        className="mt-12 rounded-2xl border border-neutral-200 bg-white p-6 text-sm text-neutral-600"
      >
        Apps could not be loaded right now.{" "}
        <Link
          to="/discover"
          className="font-semibold text-sky-800 hover:underline"
        >
          Open Discover
        </Link>
      </div>
    );
  return (
    <>
      {(() => {
        const visual = [...rankings, ...fresh.map(({ app }) => app)].find((app) => coverMedia(media.get(app.id)));
        if (!intro) return null;
        return (
          <div className="pt-6 lg:pt-10">
            <div className="mx-auto max-w-4xl">{intro}</div>
            {visual && (
              <div className="mx-auto mt-8 max-w-4xl">
                <EditorialAppCard
                  app={visual}
                  {...saveControls(visual.id)}
                  media={media.get(visual.id)}
                  metadata={metadata.get(visual.id)}
                  eyebrow={
                    rankings.some((app) => app.id === visual.id)
                      ? "Most viewed on Rocket"
                      : "New with Launch activity"
                  }
                />
              </div>
            )}
            {!visual && mediaLoading && <div aria-label="Loading featured app media" className="rocket-skeleton-surface mx-auto mt-8 h-[22rem] max-w-4xl animate-pulse rounded-2xl border border-neutral-200 bg-neutral-100" />}
          </div>
        );
      })()}
      <section className="mt-10 sm:mt-12" aria-labelledby="rankings-heading">
        <SectionHeading id="rankings-heading" title="Rankings" description="Most viewed app profiles on Rocket since view tracking began. Repeat visits from the same browser/network in a day count once." href="/discover?view=rankings" action="See all Rankings" emoji="🏆" />
        {rankings.length > 0 ? (
          <div className="grid gap-x-7 sm:grid-cols-2">
            {rankings.map((app, index) => (
              <RankedAppRow key={app.id} app={app} {...saveControls(app.id)} rank={index + 1} metadata={metadata.get(app.id)} eyebrow={`${rankingViews.get(app.id)?.toLocaleString() || "0"} Rocket views`} />
            ))}
          </div>
        ) : <p className="text-sm text-neutral-500">Rankings are unavailable right now.</p>}
      </section>
      <section className="mt-12 sm:mt-16" aria-labelledby="new-heading">
        <SectionHeading id="new-heading" title="New" description="Recently listed apps with public Launch activity." href="/discover?view=new" action="See all New" emoji="🔥" />
        {fresh.length > 0 ? (
          <div className="flex snap-x gap-3 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:grid sm:grid-cols-2 sm:overflow-visible lg:grid-cols-4">
            {fresh.map(({ app }) => (
              <div key={app.id} className="w-[min(75vw,19rem)] shrink-0 snap-start sm:w-auto">
                <StandardAppCard app={app} {...saveControls(app.id)} media={media.get(app.id)} metadata={metadata.get(app.id)} />
              </div>
            ))}
          </div>
        ) : <p className="text-sm text-neutral-500">No new apps with Launch activity are available right now.</p>}
      </section>
      <section className="mt-12 sm:mt-16" aria-labelledby="categories-heading">
        <SectionHeading id="categories-heading" title="Categories" description="Browse apps by what you want to do." href="/discover?view=categories" action="All categories" emoji="🗂️" />
        {categories.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {categories.map((item, index) => (
              <Link
                key={item.category}
                to={`/discover?view=all&category=${encodeURIComponent(item.category)}`}
                className={`rocket-category-card ${categoryGradients[index % categoryGradients.length]} group flex min-h-44 items-end justify-between gap-3 rounded-2xl p-5 transition duration-200 hover:-translate-y-1 hover:shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#167ac6] sm:p-6`}
              >
                <span className="min-w-0">
                  <strong className="block text-xl font-bold leading-tight tracking-tight sm:text-2xl">
                    {item.category}
                  </strong>
                  <span className="mt-2 block text-sm opacity-75">
                    {item.app_count.toLocaleString()} apps
                  </span>
                </span>
                <span
                  aria-hidden="true"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-current/15 bg-white/25 text-lg transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                >
                  →
                </span>
              </Link>
            ))}
          </div>
        ) : <p className="text-sm text-neutral-500">Categories are unavailable right now.</p>}
      </section>
      <section className="mt-12 sm:mt-16" aria-labelledby="saved-heading">
        <SectionHeading id="saved-heading" title="Saved" description="Keep the apps you want to try in one place." href="/saved-apps" action="Open Saved" emoji="🔖" />
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-neutral-200 bg-white px-5 py-5 sm:px-7">
          <p className="max-w-2xl text-sm leading-relaxed text-neutral-600">Save an app from its profile or a Discover card, then return to it whenever you’re ready.</p>
          <Link to="/saved-apps" className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#167ac6] px-4 text-sm font-semibold text-white hover:bg-[#1268aa]">View saved apps <span aria-hidden="true">→</span></Link>
        </div>
      </section>
    </>
  );
}
