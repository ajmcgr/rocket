import { useEffect, useState } from "react";
import { Link, useNavigate } from "@/lib/router-compat";
import CollectionOptions from "@/components/CollectionOptions";
import SiteHeader from "@/components/SiteHeader";
import { StandardAppCard } from "@/components/MarketplaceCards";
import { useSavedAppControls } from "@/hooks/useSavedAppControls";
import { useAuth } from "@/contexts/AuthContext";
import {
  collectionApps,
  collectionDetail,
  collectionPath,
  setCollectionMembership,
  COLLECTION_PAGE_SIZE,
  type Collection,
  type CollectionApp,
} from "@/lib/collections";
import { loadAppMedia, type PublicAppMedia } from "@/lib/appMedia";
import {
  loadAppCardMetadata,
  type AppCardMetadata,
} from "@/lib/appCardMetadata";

export type CollectionDetailData = {
  collection: Collection | null;
  apps: CollectionApp[];
};
function CollectionDetailContent({
  slug,
  personal = false,
  initial,
}: {
  slug: string;
  personal?: boolean;
  initial?: CollectionDetailData;
}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [collection, setCollection] = useState<Collection | null>(
    initial?.collection || null,
  );
  const [apps, setApps] = useState<CollectionApp[]>(
    initial?.apps.slice(0, COLLECTION_PAGE_SIZE) || [],
  );
  const [media, setMedia] = useState<Map<string, PublicAppMedia[]>>(new Map());
  const [metadata, setMetadata] = useState<Map<string, AppCardMetadata>>(
    new Map(),
  );
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const savedControls = useSavedAppControls(apps.map((app) => app.id));
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);
    if (personal && page === 0) {
      setCollection(null);
      setApps([]);
    }
    void (async () => {
      const next = await collectionDetail(slug, personal);
      const rows = next?.id
        ? await collectionApps(next.id, page * COLLECTION_PAGE_SIZE)
        : [];
      if (!active) return;
      setCollection(next);
      setHasMore(rows.length > COLLECTION_PAGE_SIZE);
      setApps((current) =>
        page === 0
          ? rows.slice(0, COLLECTION_PAGE_SIZE)
          : [...current, ...rows.slice(0, COLLECTION_PAGE_SIZE)],
      );
    })()
      .catch(() => {
        if (active) {
          setCollection(null);
          setApps([]);
          setError(true);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [slug, personal, user?.id, page, refresh]);
  useEffect(() => {
    let active = true;
    const ids = apps.map((app) => app.id);
    void loadAppMedia(ids)
      .then((rows) => {
        if (active) setMedia(rows);
      })
      .catch(() => undefined);
    void loadAppCardMetadata(ids)
      .then((rows) => {
        if (active) setMetadata(rows);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [apps]);
  // Revalidate open public pages on return to the tab. No persisted public/private cache.
  useEffect(() => {
    const reload = () => {
      if (document.visibilityState === "visible") {
        setPage(0);
        setRefresh((value) => value + 1);
      }
    };
    document.addEventListener("visibilitychange", reload);
    return () => document.removeEventListener("visibilitychange", reload);
  }, []);
  async function mutate(action: () => Promise<void>) {
    setBusy(true);
    setError(false);
    try {
      await action();
      setPage(0);
      setRefresh((value) => value + 1);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  const content = (
    <main className="mx-auto max-w-6xl px-5 pb-28 pt-10 sm:px-8">
      <Link
        to={personal ? "/my-collections" : "/collections"}
        className="inline-flex min-h-11 items-center text-[#469DDA]"
      >
        ← {personal ? "My Collections" : "Collections"}
      </Link>
      {collection && (
        <>
          <div className="mt-3 flex items-start justify-between gap-4">
            <h1 className="break-words font-display text-4xl sm:text-5xl">
              {collection.name}
            </h1>
            {personal && (
              <CollectionOptions
                collection={collection}
                onDeleted={() => navigate("/my-collections")}
                onUpdated={() => {
                  setPage(0);
                  setRefresh((value) => value + 1);
                }}
              />
            )}
          </div>
          <p className="mt-3 text-neutral-500">
            {collection.app_count} apps
            {personal
              ? ` · ${collection.visibility === "public" ? "Public" : "Private — only you"}`
              : " · Public collection"}
          </p>
          {!personal && (
            <p className="mt-2">
              Curated by{" "}
              {collection.username ? (
                <Link
                  className="text-[#469DDA] hover:underline"
                  to={`/u/${collection.username}`}
                >
                  {collection.full_name || `@${collection.username}`}
                </Link>
              ) : (
                "a Rocket member"
              )}
            </p>
          )}
          {(personal ? collection.visibility === "public" : true) && (
            <button
              className="mt-4 min-h-11 rounded-xl border px-4 text-[#469DDA]"
              onClick={async () => {
                const url = `${window.location.origin}${collectionPath(collection)}`;
                try {
                  if (navigator.share)
                    await navigator.share({ title: collection.name, url });
                  else {
                    await navigator.clipboard.writeText(url);
                    alert("Collection link copied.");
                  }
                } catch {
                  /* Cancelled share leaves collection unchanged. */
                }
              }}
            >
              Share collection
            </button>
          )}
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {apps.map((app) => (
              <div key={app.id} className="min-w-0">
                <StandardAppCard
                  app={app}
                  onCollectionsChanged={() => {
                    setPage(0);
                    setRefresh((value) => value + 1);
                  }}
                  {...savedControls(app.id)}
                  media={media.get(app.id)}
                  metadata={metadata.get(app.id)}
                />
                {personal && (
                  <button
                    disabled={busy}
                    className="mt-2 min-h-11 px-3 text-sm text-[#469DDA]"
                    onClick={() =>
                      void mutate(() =>
                        setCollectionMembership(collection.id!, app.id, false),
                      )
                    }
                  >
                    Remove from collection
                  </button>
                )}
              </div>
            ))}
          </div>
          {!loading && apps.length === 0 && (
            <p className="mt-8 text-neutral-500">
              {personal
                ? "Save an app, then use its bookmark to curate this shortlist. Unavailable listings are not shown."
                : "No available apps in this collection."}
            </p>
          )}
          {!loading && hasMore && (
            <button
              className="mt-6 min-h-11 rounded-xl border px-5"
              onClick={() => setPage((value) => value + 1)}
            >
              Show more apps
            </button>
          )}
        </>
      )}
      {loading && (
        <p role="status" className="mt-6">
          Loading collection…
        </p>
      )}
      {!loading && !collection && !error && (
        <h1 className="mt-6 text-2xl font-semibold">
          Collection not found or private
        </h1>
      )}
      {error && (
        <p role="alert" className="mt-6 text-red-600">
          Could not load or update this collection.{" "}
          <button
            className="min-h-11 underline"
            onClick={() => setRefresh((value) => value + 1)}
          >
            Try again
          </button>
        </p>
      )}
    </main>
  );
  return personal ? (
    content
  ) : (
    <div className="marketplace-page min-h-screen bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <SiteHeader />
      {content}
    </div>
  );
}

export default function CollectionDetail(
  props: Parameters<typeof CollectionDetailContent>[0],
) {
  const { user } = useAuth();
  return (
    <CollectionDetailContent
      key={`${props.slug}:${props.personal ? user?.id || "signed-out" : "public"}`}
      {...props}
    />
  );
}
