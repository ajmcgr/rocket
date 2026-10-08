import { useEffect, useState } from "react";
import { Ellipsis } from "lucide-react";
import { Link } from "@/lib/router-compat";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  collectionApps,
  collectionPath,
  COLLECTION_PAGE_SIZE,
  type Collection,
} from "@/lib/collections";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog";
import { CollectionMemberships } from "./CollectionPicker";

type AppOption = { id: string; name: string };

export default function CollectionOptions({
  collection,
  onUpdated,
}: {
  collection: Collection;
  onUpdated?: () => void;
}) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (!value) onUpdated?.();
      }}
    >
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label={`Collection options for ${collection.name}`}
          title="Collection options"
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-neutral-200 text-neutral-600 hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#167ac6] dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
        >
          <Ellipsis className="h-5 w-5" aria-hidden="true" />
        </button>
      </DialogTrigger>
      <DialogContent
        motion="gentle"
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle>{collection.name} options</DialogTitle>
        </DialogHeader>
        <DialogDescription>
          Choose an app to organize it into your collections. Saved always stays
          private.
        </DialogDescription>
        {collection.id && (
          <Link
            to={collectionPath(collection, true)}
            onClick={() => setOpen(false)}
            className="min-h-11 rounded-xl border px-4 py-3 text-sm font-medium text-[#167ac6]"
          >
            Rename or change collection settings
          </Link>
        )}
        {user && (
          <CollectionAppOrganizer
            key={`${user.id}:${collection.id || "saved"}`}
            collection={collection}
            userId={user.id}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function CollectionAppOrganizer({
  collection,
  userId,
}: {
  collection: Collection;
  userId: string;
}) {
  const [apps, setApps] = useState<AppOption[]>([]);
  const [appId, setAppId] = useState("");
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setFailed(false);
    void (async () => {
      let rows: AppOption[];
      let more = false;
      if (collection.id) {
        const result = await collectionApps(
          collection.id,
          page * COLLECTION_PAGE_SIZE,
        );
        rows = result.slice(0, COLLECTION_PAGE_SIZE);
        more = result.length > COLLECTION_PAGE_SIZE;
      } else {
        const saved = await supabase
          .from("saved_apps")
          .select("app_id")
          .eq("user_id", userId)
          .order("saved_at", { ascending: false })
          .range(
            page * COLLECTION_PAGE_SIZE,
            (page + 1) * COLLECTION_PAGE_SIZE,
          );
        if (saved.error) throw saved.error;
        const ids = (saved.data || [])
          .slice(0, COLLECTION_PAGE_SIZE)
          .map((row) => row.app_id);
        const result = ids.length
          ? await supabase.from("public_apps").select("id,name").in("id", ids)
          : { data: [], error: null };
        if (result.error) throw result.error;
        rows = result.data || [];
        more = (saved.data?.length || 0) > COLLECTION_PAGE_SIZE;
      }
      if (active) {
        setApps((current) => (page === 0 ? rows : [...current, ...rows]));
        setAppId((current) => current || rows[0]?.id || "");
        setHasMore(more);
      }
    })()
      .catch(() => {
        if (active) setFailed(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [collection.id, userId, page]);
  return (
    <>
      {loading && <p role="status">Loading apps…</p>}
      {failed && (
        <p role="alert">Apps could not be loaded. Close and try again.</p>
      )}
      {apps.length > 0 && (
        <>
          <label className="grid gap-2 text-sm font-medium">
            App to organize
            <select
              value={appId}
              onChange={(event) => setAppId(event.target.value)}
              className="min-h-11 min-w-0 rounded-xl border bg-transparent px-3"
            >
              {apps.map((app) => (
                <option key={app.id} value={app.id}>
                  {app.name}
                </option>
              ))}
            </select>
          </label>
          {appId && <CollectionMemberships key={appId} appId={appId} />}
        </>
      )}
      {!loading && !failed && apps.length === 0 && (
        <p className="text-sm text-neutral-500">
          Save apps to organize them here.
        </p>
      )}
      {hasMore && (
        <button
          disabled={loading}
          onClick={() => setPage((value) => value + 1)}
          className="min-h-11 rounded-xl border px-4 text-sm text-[#167ac6]"
        >
          Load more apps
        </button>
      )}
    </>
  );
}
