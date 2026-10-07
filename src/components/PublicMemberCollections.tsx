import { useEffect, useState } from "react";
import {
  COLLECTION_PAGE_SIZE,
  publicCollections,
  type Collection,
} from "@/lib/collections";
import CollectionCard from "./CollectionCard";

export default function PublicMemberCollections({
  username,
}: {
  username: string;
}) {
  const [rows, setRows] = useState<Collection[]>([]);
  const [page, setPage] = useState(0);
  const [more, setMore] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    void publicCollections(page * COLLECTION_PAGE_SIZE, username)
      .then((data) => {
        if (active) {
          setRows((current) =>
            page === 0
              ? data.slice(0, COLLECTION_PAGE_SIZE)
              : [...current, ...data.slice(0, COLLECTION_PAGE_SIZE)],
          );
          setMore(data.length > COLLECTION_PAGE_SIZE);
        }
      })
      .catch(() => {
        if (active) {
          setRows([]);
          setError(true);
        }
      });
    return () => {
      active = false;
    };
  }, [username, page]);
  return (
    <section className="mt-10" aria-labelledby="member-collections-heading">
      <h2
        id="member-collections-heading"
        className="mb-5 text-2xl font-bold tracking-tight"
      >
        Collections
      </h2>
      <div className="grid gap-4 sm:grid-cols-2">
        {rows.map((row) => (
          <CollectionCard key={row.id} collection={row} />
        ))}
      </div>
      {error ? (
        <p className="text-sm text-neutral-500">
          Public collections could not be loaded.
        </p>
      ) : (
        !rows.length && (
          <p className="text-sm text-neutral-500">No public collections yet.</p>
        )
      )}
      {more && (
        <button
          className="mt-4 min-h-11 text-[#469DDA]"
          onClick={() => setPage((value) => value + 1)}
        >
          Show more collections
        </button>
      )}
    </section>
  );
}
