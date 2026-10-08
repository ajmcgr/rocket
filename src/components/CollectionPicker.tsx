import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import {
  myCollections,
  setCollectionMembership,
  type Collection,
} from "@/lib/collections";
import CollectionForm from "./CollectionForm";

export default function CollectionPicker({
  appId,
  light,
}: {
  appId: string;
  light?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label="Add app to collections"
          title="Add to collection…"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setOpen(true);
          }}
          className={`inline-flex h-11 w-8 items-center justify-center rounded-lg border ${light ? "border-white/80 text-white" : "border-neutral-200 text-neutral-600 dark:border-neutral-700 dark:text-neutral-200"}`}
        >
          <ChevronDown className="h-4 w-4" aria-hidden="true" />
        </button>
      </DialogTrigger>
      <DialogContent
        motion="gentle"
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle>Add to collection</DialogTitle>
        </DialogHeader>
        <DialogDescription>
          Saved stays private. Add this app to as many collections as you like.
        </DialogDescription>
        <CollectionMemberships key={appId} appId={appId} />
      </DialogContent>
    </Dialog>
  );
}

/** Shared editor used by the app picker and the collection-level options dialog. */
export function CollectionMemberships({ appId }: { appId: string }) {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [memberships, setMemberships] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);
    void (async () => {
      const rows = (await myCollections()).filter((row) => row.id);
      const ids = rows.map((row) => row.id);
      const result = ids.length
        ? await (supabase as any)
            .from("collection_apps")
            .select("collection_id")
            .eq("app_id", appId)
            .in("collection_id", ids)
        : { data: [], error: null };
      if (result.error) throw result.error;
      if (active) {
        setCollections(rows);
        setMemberships(
          new Set(
            (result.data || []).map(
              (row: { collection_id: string }) => row.collection_id,
            ),
          ),
        );
      }
    })()
      .catch(() => {
        if (active) setError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [appId]);
  return (
    <>
      {loading && <p role="status">Loading your collections…</p>}
      {!loading &&
        collections.map((collection) => (
          <label
            key={collection.id}
            className="flex min-h-11 items-center gap-3 break-words text-sm"
          >
            <input
              type="checkbox"
              disabled={!!busy}
              checked={memberships.has(collection.id!)}
              onChange={async (e) => {
                const included = e.target.checked;
                setBusy(collection.id!);
                setError(false);
                try {
                  await setCollectionMembership(
                    collection.id!,
                    appId,
                    included,
                  );
                  setMemberships((current) => {
                    const next = new Set(current);
                    if (included) next.add(collection.id!);
                    else next.delete(collection.id!);
                    return next;
                  });
                } catch {
                  setError(true);
                } finally {
                  setBusy(null);
                }
              }}
            />
            <span>
              {collection.name}
              <span className="ml-2 text-xs text-neutral-500">
                {collection.visibility}
              </span>
            </span>
          </label>
        ))}
      {error && (
        <p role="alert" className="text-sm text-red-600">
          Could not update collections. Close and retry.
        </p>
      )}
      <div className="border-t pt-4">
        <h3 className="mb-3 font-semibold">New collection</h3>
        <CollectionForm
          onCreated={(collection) =>
            setCollections((rows) => [collection, ...rows])
          }
        />
      </div>
    </>
  );
}
