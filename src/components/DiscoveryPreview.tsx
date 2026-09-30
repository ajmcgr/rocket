import { useEffect, useState, type ReactNode } from "react";
import { Link } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { coverMedia, loadAppMedia, type PublicAppMedia } from "@/lib/appMedia";
import {
  EditorialAppCard,
  RankedAppRow,
  StandardAppCard,
} from "./MarketplaceCards";

type App = Tables<"public_apps">;
type Signal = Tables<"public_app_intelligence">;
type Category = Tables<"public_app_categories">;
type Preview = { app: App; signal: Signal };

export default function DiscoveryPreview({ intro }: { intro?: ReactNode }) {
  const [rising, setRising] = useState<Preview[]>([]);
  const [fresh, setFresh] = useState<Preview[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [media, setMedia] = useState<Map<string, PublicAppMedia[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    const load = async () => {
      const [risingResult, newResult, categoryResult] = await Promise.all([
        supabase
          .from("public_discoverable_app_intelligence")
          .select("*")
          .eq("signal_type", "rising")
          .order("percentile_rank", { ascending: false })
          .order("net_votes", { ascending: false })
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
      const risingSignals = risingResult.data || [];
      const freshSignals = newResult.data || [];
      const ids = [
        ...new Set(
          [...risingSignals, ...freshSignals].map((signal) => signal.app_id),
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
      setRising(mapRows(risingSignals));
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
        className="mt-6 h-24 animate-pulse rounded-xl bg-neutral-100"
      />
    );
  if (loading)
    return (
      <div className="pt-6 lg:pt-10">
        {intro}
        <div
          role="status"
          aria-label="Finding apps worth exploring"
          className="mt-5 h-20 animate-pulse rounded-xl bg-neutral-100"
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
        const visual = [...rising, ...fresh].find(({ app }) =>
          coverMedia(media.get(app.id)),
        );
        if (!intro) return null;
        return visual ? (
          <div className="grid items-stretch gap-6 pt-6 lg:grid-cols-[minmax(0,.9fr)_minmax(0,1.1fr)] lg:pt-10">
            {intro}
            <EditorialAppCard
              app={visual.app}
              media={media.get(visual.app.id)}
              eyebrow={
                rising.some(({ app }) => app.id === visual.app.id)
                  ? "Rising on Launch"
                  : "New with Launch activity"
              }
            />
          </div>
        ) : (
          <div className="pt-6 lg:pt-10">
            <div className="max-w-4xl">{intro}</div>
            {categories.length > 0 && (
              <nav
                aria-label="Popular categories"
                className="mt-4 flex gap-2 overflow-x-auto pb-2 [scrollbar-width:none]"
              >
                {categories.slice(0, 8).map((item) => (
                  <Link
                    key={item.category}
                    to={`/discover?view=all&category=${encodeURIComponent(item.category)}`}
                    className="shrink-0 rounded-full bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-[#eaf5fc]"
                  >
                    {item.category}
                  </Link>
                ))}
              </nav>
            )}
          </div>
        );
      })()}
      {rising.length > 0 && (
        <section className="mt-8 sm:mt-10" aria-labelledby="rising-heading">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[.16em] text-sky-800">
                Observed on Launch
              </p>
              <h2
                id="rising-heading"
                className="mt-2 text-3xl font-bold tracking-tight text-neutral-950 sm:text-4xl"
              >
                Rising right now
              </h2>
              <p className="mt-1 text-sm text-neutral-600">
                Public Launch activity, not verified customer growth or a Rocket
                endorsement.
              </p>
            </div>
            <Link
              to="/discover?view=rising"
              className="text-sm font-semibold text-sky-800 hover:underline"
            >
              See all Rising
            </Link>
          </div>
          <div className="grid gap-x-8 md:grid-cols-2">
            {rising.map(({ app }, index) => (
              <RankedAppRow
                key={app.id}
                app={app}
                rank={index + 1}
                eyebrow="Launch activity"
              />
            ))}
          </div>
        </section>
      )}
      {fresh.length > 0 && (
        <section className="mt-10 sm:mt-12" aria-labelledby="new-heading">
          <div className="mb-4 flex items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[.16em] text-sky-800">
                New arrivals
              </p>
              <h2
                id="new-heading"
                className="mt-2 text-3xl font-bold tracking-tight text-neutral-950 sm:text-4xl"
              >
                New with Launch activity
              </h2>
            </div>
            <Link
              to="/discover?view=new"
              className="text-sm font-semibold text-sky-800 hover:underline"
            >
              See all New
            </Link>
          </div>
          <div className="flex snap-x gap-3 overflow-x-auto pb-2 sm:grid sm:grid-cols-2 sm:overflow-visible lg:grid-cols-4">
            {fresh.map(({ app }) => (
              <div
                key={app.id}
                className="w-[min(75vw,19rem)] shrink-0 snap-start sm:w-auto"
              >
                <StandardAppCard app={app} media={media.get(app.id)} />
              </div>
            ))}
          </div>
        </section>
      )}
      {categories.length > 0 && (
        <section className="mt-12" aria-labelledby="categories-heading">
          <div className="mb-6 flex items-end justify-between">
            <h2
              id="categories-heading"
              className="text-3xl font-bold tracking-tight text-neutral-950"
            >
              Find your corner of the web
            </h2>
            <Link
              to="/discover?view=categories"
              className="text-sm font-semibold text-sky-800 hover:underline"
            >
              All categories
            </Link>
          </div>
          <div className="grid gap-x-8 sm:grid-cols-2 lg:grid-cols-4">
            {categories.map((item) => (
              <Link
                key={item.category}
                to={`/discover?view=all&category=${encodeURIComponent(item.category)}`}
                className="group flex min-h-20 items-end justify-between border-b border-neutral-200 px-2 py-4 transition hover:text-[#075985]"
              >
                <span>
                  <strong className="block text-xl font-semibold tracking-tight text-neutral-950">
                    {item.category}
                  </strong>
                  <span className="text-xs text-neutral-600">
                    {item.app_count.toLocaleString()} apps
                  </span>
                </span>
                <span
                  aria-hidden="true"
                  className="text-lg transition group-hover:translate-x-1"
                >
                  ↗
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
