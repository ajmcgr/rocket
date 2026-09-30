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
  if (loading)
    return (
      <>
        <div className="grid items-stretch gap-6 pt-8 lg:grid-cols-[minmax(0,.9fr)_minmax(0,1.1fr)] lg:pt-12">
          {intro}
          <div
            role="status"
            aria-label="Finding apps worth exploring"
            className="min-h-[22rem] animate-pulse rounded-[1.75rem] bg-neutral-200"
          />
        </div>
      </>
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
        return (
          <div className="grid items-stretch gap-6 pt-8 lg:grid-cols-[minmax(0,.9fr)_minmax(0,1.1fr)] lg:pt-12">
            {intro}
            {visual ? (
              <EditorialAppCard
                app={visual.app}
                media={media.get(visual.app.id)}
                eyebrow={
                  rising.some(({ app }) => app.id === visual.app.id)
                    ? "Rising on Launch"
                    : "New with Launch activity"
                }
              />
            ) : categories.length > 0 ? (
              <section
                className="flex flex-col rounded-[1.75rem] border border-neutral-200 bg-white p-6 shadow-[0_24px_70px_-55px_rgba(15,23,42,.5)] sm:p-8"
                aria-labelledby="browse-interests"
              >
                <p className="text-xs font-bold uppercase tracking-[.16em] text-[#075985]">
                  Explore the catalogue
                </p>
                <h2
                  id="browse-interests"
                  className="mt-3 text-3xl font-bold tracking-tight text-neutral-950"
                >
                  Find your next useful app.
                </h2>
                <p className="mt-2 text-sm text-neutral-600">
                  Browse real apps by what you want to do.
                </p>
                <div className="mt-6 grid gap-2 sm:grid-cols-2">
                  {categories.slice(0, 6).map((item) => (
                    <Link
                      key={item.category}
                      to={`/discover?view=all&category=${encodeURIComponent(item.category)}`}
                      className="flex min-h-20 flex-col justify-center rounded-xl border border-neutral-200 bg-[#f7f9fb] px-4 transition hover:border-[#469DDA] hover:bg-[#eaf5fc]"
                    >
                      <span className="font-semibold text-neutral-900">
                        {item.category}
                      </span>
                      <span className="mt-1 text-xs text-neutral-500">
                        {item.app_count.toLocaleString()} apps
                      </span>
                    </Link>
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        );
      })()}
      {rising.length > 0 && (
        <section className="mt-10 sm:mt-14" aria-labelledby="rising-heading">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
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
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
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
        <section className="mt-14" aria-labelledby="new-heading">
          <div className="mb-6 flex items-end justify-between gap-3">
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
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {fresh.map(({ app }) => (
              <StandardAppCard
                key={app.id}
                app={app}
                media={media.get(app.id)}
              />
            ))}
          </div>
        </section>
      )}
      {categories.length > 0 && (
        <section className="mt-14" aria-labelledby="categories-heading">
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
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {categories.map((item, index) => (
              <Link
                key={item.category}
                to={`/discover?view=all&category=${encodeURIComponent(item.category)}`}
                className={`group flex min-h-28 items-end justify-between rounded-2xl border border-neutral-200 p-5 transition hover:-translate-y-0.5 hover:border-sky-300 ${["bg-[#dcecf7]", "bg-[#eeeaf7]", "bg-[#e7efe8]", "bg-[#f3ebdf]"][index % 4]}`}
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
