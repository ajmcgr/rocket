import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { loadAppMedia, type PublicAppMedia } from "@/lib/appMedia";
import { loadAppCardMetadata, type AppCardMetadata } from "@/lib/appCardMetadata";
import { useSavedAppControls } from "@/hooks/useSavedAppControls";
import { StandardAppCard } from "./MarketplaceCards";
import { AppCardSkeleton } from "./MarketplaceLoadingSkeletons";

type App = Tables<"public_apps">;
const PAGE_SIZE = 24;

export default function PublicMemberApps({ username }: { username: string }) {
  const [apps, setApps] = useState<App[]>([]);
  const [page, setPage] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [media, setMedia] = useState<Map<string, PublicAppMedia[]>>(new Map());
  const [metadata, setMetadata] = useState<Map<string, AppCardMetadata>>(new Map());
  const savedControls = useSavedAppControls(apps.map((app) => app.id));

  useEffect(() => {
    let active = true;
    setLoading(true);
    setFailed(false);
    const load = async () => {
      const { data, error } = await (supabase as any).rpc("get_public_member_apps", {
        p_username: username, p_offset: page * PAGE_SIZE,
      });
      if (error) throw error;
      if (!active) return;
      const rows = (data || []) as App[];
      const visible = rows.slice(0, PAGE_SIZE);
      setApps((current) => page === 0 ? visible : [...current, ...visible.filter((app) => !current.some((existing) => existing.id === app.id))]);
      setHasMore(rows.length > PAGE_SIZE);
      setLoading(false);
      // Optional artwork/counts must not prevent public cards from appearing.
      const ids = visible.map((app) => app.id);
      void loadAppMedia(ids).then((next) => { if (active) setMedia((current) => new Map([...current, ...next])); }).catch(() => undefined);
      void loadAppCardMetadata(ids).then((next) => { if (active) setMetadata((current) => new Map([...current, ...next])); }).catch(() => undefined);
    };
    void load().catch(() => { if (active) { setFailed(true); setLoading(false); } });
    return () => { active = false; };
  }, [username, page, attempt]);

  return <section className="mt-10" aria-labelledby="member-apps-heading">
    <h2 id="member-apps-heading" className="mb-5 text-2xl font-bold tracking-tight">Public apps</h2>
    <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
      {apps.map((app) => <StandardAppCard key={app.id} app={app} {...savedControls(app.id)} media={media.get(app.id)} metadata={metadata.get(app.id)} />)}
      {loading && apps.length === 0 && <><AppCardSkeleton /><AppCardSkeleton /></>}
    </div>
    {loading && <p role="status" className="mt-4 text-sm text-neutral-500">Loading public apps…</p>}
    {failed && <div role="status" className="mt-4">Public apps could not be loaded. <button type="button" className="font-semibold text-sky-800 hover:underline" onClick={() => setAttempt((value) => value + 1)}>Try again</button></div>}
    {!loading && !failed && apps.length === 0 && <p className="text-sm text-neutral-500">No public apps yet.</p>}
    {!loading && !failed && hasMore && <button type="button" className="mt-6 rounded-xl border border-neutral-200 bg-white px-5 py-3 font-semibold text-sky-800" onClick={() => setPage((value) => value + 1)}>Show more apps</button>}
  </section>;
}
