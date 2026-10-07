import { useEffect, useState } from "react";
import type { Tables } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";
import { marketplaceTable } from "@/lib/marketplace";
import { loadAppMedia, type PublicAppMedia } from "@/lib/appMedia";
import {
  loadAppCardMetadata,
  type AppCardMetadata,
} from "@/lib/appCardMetadata";
import { useSavedAppControls } from "@/hooks/useSavedAppControls";
import { StandardAppCard } from "./MarketplaceCards";
type Pick = { app_id: string; headline: string; collection: string | null };
const collections = {
  build: "Build software",
  work: "Get work done",
  create: "Create something",
};
export default function RocketPicks() {
  const [picks, setPicks] = useState<Pick[]>([]),
    [apps, setApps] = useState<Tables<"public_apps">[]>([]);
  const [media, setMedia] = useState<Map<string, PublicAppMedia[]>>(new Map());
  const [metadata, setMetadata] = useState<Map<string, AppCardMetadata>>(
    new Map(),
  );
  const [collection, setCollection] = useState("");
  const saved = useSavedAppControls(apps.map((a) => a.id));
  useEffect(() => {
    let alive = true;
    async function load() {
      const result = await marketplaceTable("public_rocket_picks")
        .select("app_id,headline,collection")
        .not("headline", "is", null)
        .order("featured_at", { ascending: false })
        .limit(12);
      if (result.error) return; // No invented fallback picks.
      const selected: Pick[] = (result.data || []).filter((p: Pick) =>
        p.headline?.trim(),
      );
      if (!selected.length) return;
      const ids = selected.map((p) => p.app_id);
      const [catalogue, images, info] = await Promise.all([
        supabase.from("public_discoverable_apps").select("*").in("id", ids),
        loadAppMedia(ids),
        loadAppCardMetadata(ids),
      ]);
      if (alive && !catalogue.error) {
        setPicks(selected);
        setApps(catalogue.data || []);
        setMedia(images);
        setMetadata(info);
      }
    }
    void load().catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  const eligible = picks.filter(
    (p) =>
      (!collection || p.collection === collection) &&
      apps.some((a) => a.id === p.app_id),
  );
  if (!picks.length || !apps.length) return null;
  return (
    <section className="mb-10" aria-labelledby="rocket-picks-title">
      <h2 id="rocket-picks-title" className="text-2xl font-bold">
        Rocket Picks
      </h2>
      <p className="mt-2 text-sm text-neutral-600">
        Selected by Rocket’s editor, with a reason for each pick. Not verified
        usage or a quality certification.
      </p>
      <div
        className="my-4 flex flex-wrap gap-2"
        role="group"
        aria-label="Editorial collections"
      >
        {[
          ["", "All picks"],
          ...Object.entries(collections).filter(([key]) =>
            picks.some((p) => p.collection === key),
          ),
        ].map(([key, label]) => (
          <button
            key={key}
            aria-pressed={collection === key}
            onClick={() => setCollection(key)}
            className="min-h-11 rounded-lg border px-3 text-sm"
          >
            {label}
          </button>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {eligible.map((p) => {
          const app = apps.find((a) => a.id === p.app_id)!;
          return (
            <div key={p.app_id}>
              <StandardAppCard
                app={app}
                media={media.get(app.id)}
                metadata={metadata.get(app.id)}
                {...saved(app.id)}
              />
              <p className="mt-2 text-sm text-neutral-600">
                Why we picked it: {p.headline}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
