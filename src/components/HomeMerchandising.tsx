import { rocketViewsLabel } from "@/lib/homeMerchandising";
import { useEffect, useState } from "react";
import { Link } from "@/lib/router-compat";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useSavedAppControls } from "@/hooks/useSavedAppControls";
import {
  loadAppCardMetadata,
  type AppCardMetadata,
} from "@/lib/appCardMetadata";
import {
  type HomeMerchandising as HomeData,
  type HomeApp,
  type ShelfItem,
  tractionLabel,
} from "@/lib/homeMerchandising";
import {
  EditorialAppCard,
  StandardAppCard,
  RankedAppRow,
} from "./MarketplaceCards";
import AppLogo from "./AppLogo";

function Heading({
  id,
  title,
  description,
  href,
  action = "View all",
}: {
  id: string;
  title: string;
  description: string;
  href?: string;
  action?: string;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b border-neutral-200 pb-4">
      <div className="min-w-0">
        <h2 id={id} className="text-2xl font-bold tracking-tight sm:text-3xl">
          {title}
        </h2>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-neutral-600">
          {description}
        </p>
      </div>
      {href && (
        <Link
          to={href}
          className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-sky-800 hover:underline focus-visible:outline-2 focus-visible:outline-sky-500"
        >
          {action} <span aria-hidden="true">→</span>
        </Link>
      )}
    </div>
  );
}
export default function HomeMerchandising({ data }: { data: HomeData }) {
  const rows = [
    ...data.picks,
    ...data.rising,
    ...data.fresh,
    ...data.traction,
    ...data.top,
  ];
  const save = useSavedAppControls(rows.map((row) => row.app.id));
  const [metadata, setMetadata] = useState<Map<string, AppCardMetadata>>(
    new Map(),
  );
  const ids = [...new Set(rows.map((row) => row.app.id))].sort().join(",");
  useEffect(() => {
    let active = true;
    void loadAppCardMetadata(ids ? ids.split(",") : [])
      .then((result) => {
        if (active) setMetadata(result);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [ids]);
  const card = (row: ShelfItem, eyebrow?: string) => (
    <StandardAppCard
      key={row.app.id}
      app={row.app}
      {...save(row.app.id)}
      media={data.media[row.app.id]}
      metadata={metadata.get(row.app.id)}
      eyebrow={eyebrow}
    />
  );
  return (
    <>
      {data.picks.length > 0 && (
        <section className="mt-10 sm:mt-12" aria-labelledby="home-picks">
          <Heading
            id="home-picks"
            title="Rocket Picks"
            description="Apps worth knowing about right now."
            href="/picks"
          />
          <div className="grid gap-4 md:grid-cols-2">
            {data.picks.map((row, index) => (
              <div key={row.app.id} className="min-w-0">
                <EditorialAppCard
                  app={row.app}
                  {...save(row.app.id)}
                  media={data.media[row.app.id]}
                  metadata={metadata.get(row.app.id)}
                  eyebrow="Rocket Pick"
                  priority={index === 0}
                />
                {row.pick?.headline && (
                  <p className="mt-3 text-sm leading-relaxed text-neutral-600">
                    {row.pick.headline}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
      {data.rising.length > 0 && (
        <section className="mt-12 sm:mt-16" aria-labelledby="home-rising">
          <Heading
            id="home-rising"
            title="Rising on Rocket"
            description="Most viewed app pages on Rocket."
            href="/rising"
            action="View rising apps"
          />
          <div className="grid gap-x-7 lg:grid-cols-2">
            {data.rising.map((row, index) => (
              <div key={row.app.id} className="min-w-0">
                <RankedAppRow
                  app={row.app}
                  {...save(row.app.id)}
                  rank={index + 1}
                  metadata={metadata.get(row.app.id)}
                  eyebrow={rocketViewsLabel(row.viewCount)}
                />
              </div>
            ))}
          </div>
        </section>
      )}
      {data.fresh.length > 0 && (
        <section className="mt-12 sm:mt-16" aria-labelledby="home-new">
          <Heading
            id="home-new"
            title="New & Noteworthy"
            description="New to Rocket in the last 30 days, with product imagery and community interest."
            href="/discover?view=new"
            action="All new apps"
          />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {data.fresh.map((row) => card(row, "New to Rocket"))}
          </div>
        </section>
      )}
      {data.traction.length >= 3 && (
        <section className="mt-12 sm:mt-16" aria-labelledby="home-traction">
          <Heading
            id="home-traction"
            title="Proven Traction"
            description="Public evidence shared by the app’s owner. Verification is not a quality endorsement."
          />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {data.traction.map((row) =>
              card(row, tractionLabel(row.evidence!) || undefined),
            )}
          </div>
        </section>
      )}
      {data.top.length > 0 && (
        <section className="mt-12 sm:mt-16" aria-labelledby="home-top">
          <Heading
            id="home-top"
            title="Top Ranked Apps"
            description="Ranked by reviews, bookmarks and verified purchases."
            href="/discover?view=rankings"
            action="View rankings"
          />
          <div className="grid gap-x-7 lg:grid-cols-2">
            {data.top.map((row, index) => (
              <RankedAppRow
                key={row.app.id}
                app={row.app}
                {...save(row.app.id)}
                rank={index + 1}
                metadata={metadata.get(row.app.id)}
              />
            ))}
          </div>
          <Link
            to="/discover?view=rankings"
            className="mt-3 inline-block text-sm text-sky-800 hover:underline"
          >
            How rankings work →
          </Link>
        </section>
      )}
      {data.collections.length > 0 && (
        <section className="mt-12 sm:mt-16" aria-labelledby="home-collections">
          <Heading
            id="home-collections"
            title="Collections"
            description="Explore shelves curated by Rocket’s editors."
          />
          <div className="grid gap-4 sm:grid-cols-2">
            {data.collections.map((shelf) => (
              <Link
                key={shelf.name}
                to={`/picks?collection=${encodeURIComponent(shelf.name)}`}
                className="min-w-0 rounded-2xl border border-neutral-200 p-5 hover:border-sky-300 focus-visible:outline-2 focus-visible:outline-sky-500"
              >
                <div className="mb-4 flex flex-wrap gap-2">
                  {shelf.items.slice(0, 5).map(({ app }) => (
                    <AppLogo
                      key={app.id}
                      name={app.name}
                      src={app.logo_url}
                      className="h-12 w-12"
                    />
                  ))}
                </div>
                <h3 className="break-words text-xl font-semibold">
                  {shelf.name}
                </h3>
                <p className="mt-2 text-sm text-neutral-500">
                  Rocket editorial · {shelf.items.length} apps in this preview
                </p>
                <span className="mt-4 inline-block text-sm font-semibold text-sky-800">
                  Explore collection →
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}
      {data.categories.length > 0 && (
        <section className="mt-12 sm:mt-16" aria-labelledby="home-categories">
          <Heading
            id="home-categories"
            title="Categories"
            description="Find apps for what you want to do."
            href="/discover?view=categories"
            action="All categories"
          />
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {data.categories.map((category) => (
              <Link
                key={category.category}
                to={`/discover?view=all&category=${encodeURIComponent(category.category)}`}
                className="min-w-0 rounded-xl border border-neutral-200 px-4 py-4 hover:border-sky-300 focus-visible:outline-2 focus-visible:outline-sky-500"
              >
                <strong className="block break-words text-sm sm:text-base">
                  {category.category}
                </strong>
                <span className="mt-1 block text-xs text-neutral-500">
                  {category.app_count.toLocaleString()} apps
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}
      <PersonalHomeShelves />
    </>
  );
}
function PersonalHomeShelves() {
  const { user } = useAuth();
  return user ? <PersonalShelves key={user.id} userId={user.id} /> : null;
}
function PersonalShelves({ userId }: { userId: string }) {
  const [saved, setSaved] = useState<HomeApp[]>([]);
  const [following, setFollowing] = useState<HomeApp[]>([]);
  const save = useSavedAppControls(
    [...saved, ...following].map((app) => app.id),
  );
  useEffect(() => {
    let active = true;
    void (async () => {
      const { data, error } = await supabase
        .from("saved_apps")
        .select("app_id")
        .eq("user_id", userId)
        .order("saved_at", { ascending: false })
        .limit(6);
      if (error || !data?.length) return;
      const { data: apps } = await supabase
        .from("public_discoverable_apps")
        .select("*")
        .in(
          "id",
          data.map((row) => row.app_id),
        );
      if (active)
        setSaved(
          data.flatMap((row) => {
            const app = apps?.find((app) => app.id === row.app_id);
            return app ? [app] : [];
          }),
        );
    })().catch(() => undefined);
    void (async () => {
      const { data, error } = await (supabase as any)
        .from("marketplace_follows")
        .select("target")
        .eq("user_id", userId)
        .like("target", "developer:%")
        .order("created_at", { ascending: false })
        .limit(8);
      if (error || !data?.length) return;
      const results = await Promise.all(
        data.map(async (row: { target: string }) => {
          const { data, error } = await (supabase as any).rpc(
            "get_public_member_apps",
            { p_username: row.target.slice(10), p_offset: 0 },
          );
          return error ? [] : data || [];
        }),
      );
      const apps = [
        ...new Map<string, HomeApp>(
          results.flat().map((app: HomeApp) => [app.id, app]),
        ).values(),
      ];
      if (!apps.length) return;
      const { data: releases, error: releaseError } = await (supabase as any)
        .from("app_releases")
        .select("app_id,created_at")
        .in(
          "app_id",
          apps.map((app) => app.id),
        )
        .gte("created_at", new Date(Date.now() - 30 * 86400000).toISOString())
        .order("created_at", { ascending: false })
        .limit(6);
      if (active && !releaseError)
        setFollowing(
          (releases || [])
            .flatMap((r: { app_id: string }) => {
              const app = apps.find((app) => app.id === r.app_id);
              return app ? [app] : [];
            })
            .filter(
              (app: HomeApp, index: number, rows: HomeApp[]) =>
                rows.findIndex((a) => a.id === app.id) === index,
            ),
        );
    })().catch(() => undefined);
    return () => {
      active = false;
    };
  }, [userId]);
  return (
    <>
      {following.length > 0 && (
        <section className="mt-12 sm:mt-16" aria-labelledby="home-following">
          <Heading
            id="home-following"
            title="From developers you follow"
            description="Apps with release notes published in the last 30 days."
          />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {following.map((app) => (
              <StandardAppCard key={app.id} app={app} {...save(app.id)} />
            ))}
          </div>
        </section>
      )}
      {saved.length > 0 && (
        <section className="mt-12 sm:mt-16" aria-labelledby="home-saved">
          <Heading
            id="home-saved"
            title="Continue exploring"
            description="Return to apps you’ve saved."
            href="/saved-apps"
            action="Open Saved"
          />
          <div className="grid gap-x-7 lg:grid-cols-2">
            {saved.map((app, index) => (
              <RankedAppRow
                key={app.id}
                app={app}
                rank={index + 1}
                {...save(app.id)}
              />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
