import { useEffect, useState, type ReactElement } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  Bookmark,
  Folder,
  Globe,
  Lock,
  Plus,
  ArrowLeft,
  LoaderCircle,
} from "lucide-react";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { CollectionDialogContent } from "./CollectionDialog";
import { supabase } from "@/integrations/supabase/client";
import {
  myCollections,
  setCollectionMembership,
  type Collection,
} from "@/lib/collections";
import CollectionForm from "./CollectionForm";
import { Button } from "./ui/button";

type PickerProps = {
  appId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: ReactElement;
  saved: boolean;
  saving?: boolean;
  error?: boolean;
  onSavedChange: (saved: boolean) => void;
};
export default function CollectionPicker({
  appId,
  open,
  onOpenChange,
  trigger,
  saved,
  saving,
  error,
  onSavedChange,
}: PickerProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild onClick={(event) => event.stopPropagation()}>
        {trigger}
      </DialogTrigger>
      <CollectionDialogContent onClick={(e) => e.stopPropagation()}>
        <DialogHeader className="pr-7 text-left">
          <DialogTitle className="text-xl">Save to collection</DialogTitle>
          <DialogDescription>
            Keep it private or add it to a collection you share.
          </DialogDescription>
        </DialogHeader>
        <label className="flex min-h-16 cursor-pointer items-center gap-3 rounded-xl border border-neutral-200 p-3 dark:border-neutral-700">
          <Bookmark
            className="h-5 w-5 text-[#167ac6]"
            fill={saved ? "currentColor" : "none"}
            aria-hidden="true"
          />
          <span className="flex-1">
            <span className="block text-sm font-semibold">Saved</span>
            <span className="block text-xs text-neutral-500">
              Private · only you
            </span>
          </span>
          <input
            type="checkbox"
            aria-label="Keep in Saved"
            className="h-4 w-4 accent-[#167ac6]"
            checked={saved}
            disabled={saving}
            onChange={(e) => onSavedChange(e.target.checked)}
          />
        </label>
        {error && (
          <p role="alert" className="text-sm text-red-600">
            Could not update Saved. Please try again.
          </p>
        )}
        <CollectionMemberships key={appId} appId={appId} />
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={() => onOpenChange(false)}
        >
          Done
        </Button>
      </CollectionDialogContent>
    </Dialog>
  );
}

export function CollectionMemberships({ appId }: { appId: string }) {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [memberships, setMemberships] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [creating, setCreating] = useState(false);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);
    void (async () => {
      const rows = (await myCollections()).filter((row) => row.id);
      const ids = rows.map((row) => row.id);
      const result = ids.length
        ? await (supabase as SupabaseClient)
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
  if (creating)
    return (
      <div className="space-y-4">
        <button
          type="button"
          className="inline-flex min-h-10 items-center gap-2 text-sm text-neutral-500 hover:text-neutral-900"
          onClick={() => setCreating(false)}
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Your collections
        </button>
        <CollectionForm
          onCancel={() => setCreating(false)}
          onCreated={(collection) => {
            setCollections((rows) => [collection, ...rows]);
            setCreating(false);
          }}
        />
      </div>
    );
  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
        Your collections
      </p>
      {loading && (
        <p
          role="status"
          className="flex items-center gap-2 py-4 text-sm text-neutral-500"
        >
          <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
          Loading your collections…
        </p>
      )}
      {!loading &&
        collections.map((collection) => (
          <label
            key={collection.id}
            className={`flex min-h-16 cursor-pointer items-center gap-3 rounded-xl border p-3 transition ${memberships.has(collection.id!) ? "border-[#167ac6]/40 bg-[#167ac6]/5" : "border-neutral-200 hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800"}`}
          >
            <Folder
              className="h-5 w-5 shrink-0 text-neutral-400"
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1">
              <span className="block break-words text-sm font-medium">
                {collection.name}
              </span>
              <span className="mt-0.5 flex items-center gap-1 text-xs text-neutral-500">
                {collection.visibility === "public" ? (
                  <Globe className="h-3 w-3" aria-hidden="true" />
                ) : (
                  <Lock className="h-3 w-3" aria-hidden="true" />
                )}
                {collection.visibility === "public" ? "Public" : "Private"}
              </span>
            </span>
            <input
              type="checkbox"
              aria-label={collection.name}
              className="h-4 w-4 shrink-0 accent-[#167ac6]"
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
          </label>
        ))}
      {!loading && !error && collections.length === 0 && (
        <p className="rounded-xl bg-neutral-50 p-4 text-sm text-neutral-500 dark:bg-neutral-800">
          Create your first collection to keep related apps together.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-600">
          Could not update collections. Close and retry.
        </p>
      )}
      <Button
        type="button"
        variant="ghost"
        className="w-full justify-start text-[#167ac6]"
        onClick={() => setCreating(true)}
      >
        <Plus aria-hidden="true" />
        New collection
      </Button>
    </div>
  );
}
