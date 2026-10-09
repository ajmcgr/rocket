import { supabase } from "@/integrations/supabase/client";
import { marketplaceRpc } from "./marketplace";
import type { Tables } from "@/integrations/supabase/types";
import { loadAppMedia, coverMedia, type PublicAppMedia } from "./appMedia";

export type HomeApp = Tables<"public_apps">;
export type RocketViewRanking = Pick<
  Tables<"public_app_rankings">,
  "app_id" | "rocket_view_count"
>;
export type HomeSignal = Tables<"public_app_intelligence">;
export type HomePick = {
  app_id: string;
  placement: string;
  headline: string | null;
  featured_at: string;
  collection: string | null;
};
export type HomeEvidence = Tables<"public_app_traction">;
export type ShelfItem = {
  app: HomeApp;
  pick?: HomePick;
  signal?: HomeSignal;
  viewCount?: number;
  evidence?: HomeEvidence;
};
export type EditorialShelf = { name: string; items: ShelfItem[] };
export type HomeMerchandising = {
  picks: ShelfItem[];
  rising: ShelfItem[];
  fresh: ShelfItem[];
  traction: ShelfItem[];
  top: ShelfItem[];
  collections: EditorialShelf[];
  categories: Tables<"public_app_categories">[];
  media: Record<string, PublicAppMedia[]>;
};
export const emptyMerchandising = (): HomeMerchandising => ({
  picks: [],
  rising: [],
  fresh: [],
  traction: [],
  top: [],
  collections: [],
  categories: [],
  media: {},
});
// No secret, financial, private metric or auth query belongs in this public loader.
async function optionalRows<T>(
  request: PromiseLike<{ data: T[] | null; error?: unknown }>,
): Promise<T[]> {
  try {
    const result = await request;
    return result.error ? [] : result.data || [];
  } catch {
    return [];
  }
}
export function risingQuery(limit = 6) {
  return supabase
    .from("public_app_rankings")
    .select("app_id,rocket_view_count")
    .gt("rocket_view_count", 0)
    .order("rocket_view_count", { ascending: false })
    .order("last_viewed_at", { ascending: false, nullsFirst: false })
    .order("launched_at", { ascending: false, nullsFirst: false })
    .order("app_id", { ascending: true })
    .limit(limit);
}
export function rankingsQuery(limit = 8, category = "") {
  return marketplaceRpc("get_public_app_rankings", {
    p_category: category,
    p_limit: limit,
  });
}
export function picksQuery(collection?: string, limit = 24) {
  let query = (supabase as any)
    .from("public_rocket_picks")
    .select("app_id,placement,headline,featured_at,collection")
    .order("featured_at", { ascending: false })
    .order("app_id", { ascending: true })
    .limit(limit);
  if (collection) query = query.eq("collection", collection);
  return query as PromiseLike<{ data: HomePick[] | null; error?: unknown }>;
}
export function tractionLabel(e: HomeEvidence) {
  const provider =
    e.provider === "ga4"
      ? "Google Analytics"
      : e.provider === "posthog"
        ? "PostHog"
        : null;
  if (!provider || !["exact", "range", "verified_only"].includes(e.visibility))
    return null;
  if (
    e.visibility === "exact" &&
    e.value != null &&
    Number.isFinite(Number(e.value)) &&
    Number(e.value) > 0
  ) {
    const metric =
      e.metric_type === "active_users"
        ? "active users"
        : e.metric_type === "views"
          ? "views"
          : null;
    if (metric)
      return `${Number(e.value).toLocaleString("en-US")} ${metric} · ${provider} · ${e.metric_date}`;
  }
  return `Usage verified by ${provider}`; // Never infer monthly totals or reveal private values.
}
export function composeHome(input: {
  apps: HomeApp[];
  picks: HomePick[];
  rising: RocketViewRanking[];
  fresh: HomeSignal[];
  rankedIds: string[];
  evidence: HomeEvidence[];
  categories: Tables<"public_app_categories">[];
  media: Map<string, PublicAppMedia[]>;
  now?: number;
}): HomeMerchandising {
  const byId = new Map(input.apps.map((app) => [app.id, app]));
  const item = (id: string): ShelfItem | undefined => {
    const app = byId.get(id);
    return app ? { app } : undefined;
  };
  const picks = input.picks.flatMap((pick) => {
    const row = item(pick.app_id);
    return row ? [{ ...row, pick }] : [];
  });
  const recent = (app: HomeApp) => {
    const t = Date.parse(app.discovered_at);
    const now = input.now ?? Date.now();
    return t <= now && t >= now - 30 * 86400000;
  };
  const fresh = input.fresh.flatMap((signal) => {
    const row = item(signal.app_id);
    return row &&
      recent(row.app) &&
      (row.app.tagline || row.app.description || "").trim().length >= 20 &&
      row.app.logo_url &&
      coverMedia(input.media.get(row.app.id))
      ? [{ ...row, signal }]
      : [];
  });
  const evidenceByApp = new Map<string, HomeEvidence>();
  for (const evidence of input.evidence)
    if (tractionLabel(evidence) && !evidenceByApp.has(evidence.app_id))
      evidenceByApp.set(evidence.app_id, {
        ...evidence,
        value: evidence.visibility === "exact" ? evidence.value : null,
        value_range:
          evidence.visibility === "range" ? evidence.value_range : null,
      });
  const traction = [...evidenceByApp.values()].flatMap((evidence) => {
    const row = item(evidence.app_id);
    return row ? [{ ...row, evidence }] : [];
  });
  const shelves = new Map<string, ShelfItem[]>();
  for (const row of picks)
    if (row.pick?.collection?.trim()) {
      const name = row.pick.collection.trim();
      const rows = shelves.get(name) || [];
      if (!rows.some((x) => x.app.id === row.app.id)) rows.push(row);
      shelves.set(name, rows);
    }
  return {
    picks: picks
      .sort(
        (a, b) =>
          (({ lead: 0, secondary: 1, standard: 2 })[a.pick!.placement] ?? 2) -
          ({ lead: 0, secondary: 1, standard: 2 }[b.pick!.placement] ?? 2),
      )
      .slice(0, 5),
    rising: input.rising
      .flatMap((signal) => {
        const row = item(signal.app_id);
        return row ? [{ ...row, viewCount: signal.rocket_view_count }] : [];
      })
      .slice(0, 6),
    fresh: fresh.slice(0, 4),
    traction: traction.length >= 3 ? traction.slice(0, 4) : [],
    top: input.rankedIds
      .flatMap((id) => {
        const row = item(id);
        return row ? [row] : [];
      })
      .slice(0, 8),
    collections: [...shelves]
      .filter(([, items]) => items.length >= 2)
      .slice(0, 4)
      .map(([name, items]) => ({ name, items })),
    categories: input.categories.slice(0, 8),
    media: Object.fromEntries(input.media),
  };
}
export async function loadHomeMerchandising(): Promise<HomeMerchandising> {
  const [picks, rising, fresh, rankings, evidence, categories] =
    await Promise.all([
      optionalRows(picksQuery()),
      optionalRows(risingQuery()),
      optionalRows(
        supabase
          .from("public_discoverable_app_intelligence")
          .select("*")
          .eq("signal_type", "new_interesting")
          .order("percentile_rank", { ascending: false })
          .order("net_votes", { ascending: false })
          .order("app_id", { ascending: true })
          .limit(4),
      ),
      optionalRows(rankingsQuery()),
      optionalRows(
        supabase
          .from("public_app_traction")
          .select(
            "app_id,metric_type,visibility,value,value_range,metric_date,provider,last_verified_at",
          )
          .in("provider", ["ga4", "posthog"])
          .order("last_verified_at", { ascending: false })
          .limit(12),
      ),
      optionalRows(
        supabase
          .from("public_app_categories")
          .select("category,app_count")
          .order("app_count", { ascending: false })
          .limit(8),
      ),
    ]);
  const ids = [
    ...new Set(
      [...picks, ...rising, ...fresh, ...rankings, ...evidence].map(
        (row) => row.app_id,
      ),
    ),
  ];
  const [apps, media] = await Promise.all([
    ids.length
      ? optionalRows(
          supabase.from("public_discoverable_apps").select("*").in("id", ids),
        )
      : Promise.resolve([]),
    loadAppMedia([
      ...new Set([...picks, ...fresh].map((row) => row.app_id)),
    ]).catch(() => new Map<string, PublicAppMedia[]>()),
  ]);
  return composeHome({
    apps,
    picks,
    rising,
    fresh,
    rankedIds: rankings.map((row) => row.app_id),
    evidence,
    categories,
    media,
  });
}
export async function loadCuratedApps(
  kind: "rising" | "picks",
  collection?: string,
): Promise<ShelfItem[]> {
  const signals = kind === "rising" ? await optionalRows(risingQuery(24)) : [];
  const picks =
    kind === "picks" ? await optionalRows(picksQuery(collection)) : [];
  const ids = [...signals, ...picks].map((row) => row.app_id);
  const apps = ids.length
    ? await optionalRows(
        supabase.from("public_discoverable_apps").select("*").in("id", ids),
      )
    : [];
  const byId = new Map(apps.map((app) => [app.id, app]));
  return ids.flatMap((id) => {
    const app = byId.get(id);
    return app
      ? [
          {
            app,
            viewCount: signals.find((s) => s.app_id === id)?.rocket_view_count,
            pick: picks.find((p) => p.app_id === id),
          },
        ]
      : [];
  });
}
