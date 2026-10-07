import { useEffect, useState } from "react";
import SiteHeader from "@/components/SiteHeader";
import CollectionCard from "@/components/CollectionCard";
import CollectionForm from "@/components/CollectionForm";
import {
  COLLECTION_PAGE_SIZE,
  myCollections,
  publicCollections,
  type Collection,
} from "@/lib/collections";
import { useAuth } from "@/contexts/AuthContext";

function CollectionsContent({
  personal = false,
  initial = [],
}: {
  personal?: boolean;
  initial?: Collection[];
}) {
  const { user } = useAuth();
  const [rows, setRows] = useState(initial.slice(0, COLLECTION_PAGE_SIZE));
  const [hasMore, setHasMore] = useState(initial.length > COLLECTION_PAGE_SIZE);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);
    if (personal) setRows([]); // Never retain another session's private state.
    void (
      personal
        ? myCollections()
        : publicCollections(page * COLLECTION_PAGE_SIZE)
    )
      .then((data) => {
        if (!active) return;
        setRows((current) =>
          personal || page === 0
            ? data.slice(0, personal ? undefined : COLLECTION_PAGE_SIZE)
            : [...current, ...data.slice(0, COLLECTION_PAGE_SIZE)],
        );
        setHasMore(!personal && data.length > COLLECTION_PAGE_SIZE);
      })
      .catch(() => {
        if (active) {
          setRows([]);
          setError(true);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [personal, user?.id, page, refresh]);
  const content = (
    <main className="mx-auto max-w-6xl px-5 pb-28 pt-10 sm:px-8">
      <h1 className="font-display text-4xl sm:text-5xl">
        {personal ? "My Collections" : "Collections"}
      </h1>
      <p className="mt-3 max-w-2xl text-neutral-500">
        {personal
          ? "Your shortlist, your taste. Saved is always private; share only the collections you choose."
          : "Discover software through people’s taste. Community collections, recently updated."}
      </p>
      {personal && (
        <details className="mt-6 rounded-2xl border p-5">
          <summary className="cursor-pointer font-semibold text-[#469DDA]">
            New collection
          </summary>
          <div className="mt-4 max-w-lg">
            <CollectionForm
              onCreated={() => setRefresh((value) => value + 1)}
            />
          </div>
        </details>
      )}
      {error && (
        <p role="alert" className="mt-6">
          Collections could not be loaded.{" "}
          <button
            onClick={() => setRefresh((value) => value + 1)}
            className="min-h-11 text-[#469DDA] underline"
          >
            Try again
          </button>
        </p>
      )}
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((row) => (
          <CollectionCard
            key={row.id || "saved"}
            collection={row}
            personal={personal}
          />
        ))}
      </div>
      {loading && (
        <p role="status" className="mt-6 text-neutral-500">
          Loading collections…
        </p>
      )}
      {!loading && !error && rows.length === 0 && (
        <p className="mt-8 text-neutral-500">
          No public collections yet. The first useful shortlist could be yours.
        </p>
      )}
      {hasMore && !loading && (
        <button
          className="mt-6 min-h-11 rounded-xl border px-5 text-[#469DDA]"
          onClick={() => setPage((value) => value + 1)}
        >
          Show more collections
        </button>
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

export default function Collections(
  props: Parameters<typeof CollectionsContent>[0],
) {
  const { user } = useAuth();
  return (
    <CollectionsContent
      key={props.personal ? user?.id || "signed-out" : "public"}
      {...props}
    />
  );
}
