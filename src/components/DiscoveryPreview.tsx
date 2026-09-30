import { useEffect, useState, type ReactNode } from "react";
import { Link } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { coverMedia, loadAppMedia, type PublicAppMedia } from "@/lib/appMedia";
import {
  EditorialAppCard,
  RisingAppCard,
  StandardAppCard,
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
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-xl" aria-hidden="true">
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
  const [fresh, setFresh] = useState<Preview[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [media, setMedia] = useState<Map<string, PublicAppMedia[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    const load = async () => {
      const [rankingResult, newResult, categoryResult] = await Promise.all([
        supabase
          .from("public_app_rankings")
          .select("app_id,launch_net_votes")
          .order("launch_net_votes", { ascending: false })
          .order("launched_at", { ascending: false, nullsFirst: false })
          .order("app_id", { ascending: true })
          .limit(5),
        supabase
          .from("public_discoverable_app_intelligence")
          .select("*")
          .eq("signal_type", "new_interesting")
          .order("percentile_rank", { ascending: false })
          .order("net_votes", { ascending: false })
          .limit(4),
        supabase
          .from("public_app_categories")
          .select("category,app_count")
          .order("app_count", { ascending: false })
          .limit(8),
      ]);
      if (rankingResult.error || newResult.error || categoryResult.error)
        throw rankingResult.error || newResult.error || categoryResult.error;
      const rankingRows = rankingResult.data || [];
      const freshSignals = newResult.data || [];
      const ids = [
        ...new Set(
          [...rankingRows, ...freshSignals].map((signal) => signal.app_id),
        ),
      ];
      const [appResult, mediaResult] = await Promise.all([
        ids.length
          ? supabase.from("public_discoverable_apps").select("*").in("id", ids)
          : Promise.resolve({ data: [] as App[] }),
        loadAppMedia(ids),
      ]);
      if (!active) return;
      const apps = new Map((appResult.data || []).map((app) => [app.id, app]));
      const mapRows = (signals: Signal[]) =>
        signals.flatMap((signal) => {
          const app = apps.get(signal.app_id);
          return app ? [{ app, signal }] : [];
        });
      setRankings(rankingRows.flatMap((row) => apps.get(row.app_id) ? [apps.get(row.app_id)!] : []));
      setFresh(mapRows(freshSignals));
      setCategories(categoryResult.data || []);
      setMedia(mediaResult);
      setLoading(false);
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
  if (loading && !intro)
    return (
      <div
        role="status"
        aria-label="Finding apps worth exploring"
        className="rocket-skeleton-surface mt-6 h-24 animate-pulse rounded-xl"
      />
    );
  if (loading)
    return (
      <div className="pt-6 lg:pt-10">
        {intro}
        <div
          role="status"
          aria-label="Finding apps worth exploring"
          className="rocket-skeleton-surface mt-5 h-20 animate-pulse rounded-xl"
        />
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
        return visual ? (
          <div className="grid items-stretch gap-6 pt-6 lg:grid-cols-[minmax(0,.9fr)_minmax(0,1.1fr)] lg:pt-10">
            {intro}
            <EditorialAppCard
              app={visual}
              media={media.get(visual.id)}
              eyebrow={
                rankings.some((app) => app.id === visual.id)
                  ? "Popular on Launch"
                  : "New with Launch activity"
              }
            />
          </div>
        ) : (
          <div className="pt-6 lg:pt-10">
            <div className="max-w-4xl">{intro}</div>
          </div>
        );
      })()}
      <section className="mt-10 sm:mt-12" aria-labelledby="rankings-heading">
        <SectionHeading id="rankings-heading" title="Rankings" description="Top apps by public Launch votes. This is not verified customer growth or a Rocket endorsement." href="/discover?view=rankings" action="See all Rankings" emoji="🏆" />
        {rankings.length > 0 ? (
          <div className="flex snap-x gap-3 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:grid sm:grid-cols-2 sm:overflow-visible lg:grid-cols-5">
            {rankings.map((app, index) => (
              <div key={app.id} className="w-[min(72vw,18rem)] shrink-0 snap-start sm:w-auto">
                <RisingAppCard app={app} rank={index + 1} />
              </div>
            ))}
          </div>
        ) : <p className="text-sm text-neutral-500">Rankings are unavailable right now.</p>}
      </section>
      <section className="mt-12 sm:mt-16" aria-labelledby="new-heading">
        <SectionHeading id="new-heading" title="New" description="Recently listed apps with public Launch activity." href="/discover?view=new" action="See all New" emoji="✨" />
        {fresh.length > 0 ? (
          <div className="flex snap-x gap-3 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:grid sm:grid-cols-2 sm:overflow-visible lg:grid-cols-4">
            {fresh.map(({ app }) => (
              <div key={app.id} className="w-[min(75vw,19rem)] shrink-0 snap-start sm:w-auto">
                <StandardAppCard app={app} media={media.get(app.id)} />
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
