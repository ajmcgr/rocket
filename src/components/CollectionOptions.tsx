import { useEffect, useState } from "react";
import { ArrowLeft, ChevronRight, Ellipsis, Search } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  collectionApps,
  COLLECTION_PAGE_SIZE,
  type Collection,
} from "@/lib/collections";
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog";
import { CollectionMemberships } from "./CollectionPicker";
import { CollectionDialogContent } from "./CollectionDialog";
import CollectionSettings from "./CollectionSettings";
import AppLogo from "./AppLogo";
import { Button } from "./ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./ui/tabs";

type AppOption = { id: string; name: string; logo_url?: string | null };

export default function CollectionOptions({
  collection,
  onUpdated,
  onDeleted,
}: {
  collection: Collection;
  onUpdated?: () => void;
  onDeleted?: () => void;
}) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"settings" | "apps">("settings");
  const close = () => {
    setOpen(false);
    onUpdated?.();
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (!value) onUpdated?.();
        else setTab("settings");
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
      <CollectionDialogContent>
        <DialogHeader className="pr-7 text-left">
          <DialogTitle className="text-xl">
            {collection.id ? "Manage collection" : "Organize Saved"}
          </DialogTitle>
          <DialogDescription>
            {collection.id
              ? collection.name
              : "Your private shortlist. Choose an app to organize."}
          </DialogDescription>
        </DialogHeader>
        {collection.id ? (
          <Tabs
            value={tab}
            onValueChange={(value) => setTab(value as "settings" | "apps")}
          >
            <TabsList
              className="mb-4 grid h-auto grid-cols-2 gap-1 rounded-xl bg-neutral-100 p-1 dark:bg-neutral-800"
              aria-label="Collection options"
            >
              <TabsTrigger value="settings" className="min-h-10 rounded-lg">
                Settings
              </TabsTrigger>
              <TabsTrigger value="apps" className="min-h-10 rounded-lg">
                Organize apps
              </TabsTrigger>
            </TabsList>
            <TabsContent value="settings">
              <CollectionSettings
                key={`${user?.id}:${collection.id}`}
                collection={collection}
                onSaved={close}
                onDeleted={() => {
                  close();
                  onDeleted?.();
                }}
              />
            </TabsContent>
            <TabsContent value="apps">
              {user && (
                <CollectionAppOrganizer
                  key={`${user.id}:${collection.id}`}
                  collection={collection}
                  userId={user.id}
                />
              )}
            </TabsContent>
          </Tabs>
        ) : (
          user && (
            <CollectionAppOrganizer
              key={`${user.id}:saved`}
              collection={collection}
              userId={user.id}
            />
          )
        )}
      </CollectionDialogContent>
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
  const [search, setSearch] = useState("");
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
          ? await supabase
              .from("public_apps")
              .select("id,name,logo_url")
              .in("id", ids)
          : { data: [], error: null };
        if (result.error) throw result.error;
        rows = result.data || [];
        more = (saved.data?.length || 0) > COLLECTION_PAGE_SIZE;
      }
      if (active) {
        setApps((current) => (page === 0 ? rows : [...current, ...rows]));
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
  const selected = apps.find((app) => app.id === appId);
  if (selected)
    return (
      <div className="space-y-5">
        <button
          type="button"
          onClick={() => setAppId("")}
          className="inline-flex min-h-10 items-center gap-2 text-sm text-neutral-500 hover:text-neutral-900"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          All apps
        </button>
        <div className="flex items-center gap-3">
          <AppLogo
            name={selected.name}
            src={selected.logo_url}
            className="h-10 w-10"
          />
          <h3 className="min-w-0 break-words font-semibold">{selected.name}</h3>
        </div>
        <CollectionMemberships key={appId} appId={appId} />
      </div>
    );
  const filtered = apps.filter((app) =>
    app.name.toLowerCase().includes(search.trim().toLowerCase()),
  );
  return (
    <div className="space-y-3">
      {apps.length > 0 && (
        <label className="flex min-h-11 items-center gap-2 rounded-xl border border-neutral-200 px-3 dark:border-neutral-700">
          <Search className="h-4 w-4 text-neutral-400" aria-hidden="true" />
          <input
            aria-label="Search apps to organize"
            placeholder="Find an app…"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
      )}
      <div className="max-h-72 space-y-1 overflow-y-auto">
        {filtered.map((app) => (
          <button
            type="button"
            key={app.id}
            onClick={() => setAppId(app.id)}
            className="flex min-h-16 w-full items-center gap-3 rounded-xl px-2 py-3 text-left transition hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-[#167ac6] dark:hover:bg-neutral-800"
          >
            <AppLogo name={app.name} src={app.logo_url} className="h-10 w-10" />
            <span className="min-w-0 flex-1 break-words text-sm font-medium">
              {app.name}
            </span>
            <ChevronRight
              className="h-4 w-4 text-neutral-400"
              aria-hidden="true"
            />
          </button>
        ))}
      </div>
      {loading && (
        <p role="status" className="py-4 text-sm text-neutral-500">
          Loading apps…
        </p>
      )}
      {failed && (
        <p role="alert" className="text-sm text-red-600">
          Apps could not be loaded. Close and try again.
        </p>
      )}
      {!loading && !failed && !apps.length && (
        <p className="rounded-xl bg-neutral-50 p-4 text-sm text-neutral-500 dark:bg-neutral-800">
          {collection.id
            ? "This collection is empty. Use an app’s bookmark to add it here."
            : "Save apps to organize them here."}
        </p>
      )}
      {!!apps.length && !filtered.length && (
        <p className="py-4 text-sm text-neutral-500">No matching apps.</p>
      )}
      {hasMore && (
        <Button
          variant="outline"
          type="button"
          disabled={loading}
          onClick={() => setPage((value) => value + 1)}
        >
          Load more apps
        </Button>
      )}
    </div>
  );
}
