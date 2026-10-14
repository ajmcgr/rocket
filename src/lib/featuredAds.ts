import { supabase } from "@/integrations/supabase/client";

export type FeaturedPlacement = {
  sponsorship_id: string;
  sponsorship_type: "featured_app";
  homepage_slot_id: string;
  destination_url: string | null;
  app: {
    id: string;
    name: string;
    slug: string | null;
    tagline: string | null;
    logo_url: string | null;
  };
};
export type FeaturedInventory = {
  placements: FeaturedPlacement[];
  occupiedSlotIds: string[];
};

let cached: {
  expiresAt: number;
  promise: Promise<FeaturedInventory>;
} | null = null;

/** One short-lived inventory request is shared by the homepage rows and footer. */
export function loadFeaturedPlacements(): Promise<FeaturedInventory> {
  if (cached && cached.expiresAt > Date.now()) return cached.promise;
  const promise = supabase.functions
    .invoke("rocket-advertising", {
      body: { action: "active", category: null },
    })
    .then(({ data, error }) => {
      if (error) throw error;
      const placements = (data?.placements || []).filter(
        (item: FeaturedPlacement) =>
          item.sponsorship_type === "featured_app" &&
          /^homepage_featured_[1-8]$/.test(item.homepage_slot_id),
      );
      const occupiedSlotIds = (data?.occupied_homepage_slots || []).filter(
        (slot: string) => /^homepage_featured_[1-8]$/.test(slot),
      );
      return { placements, occupiedSlotIds };
    })
    .catch((error) => {
      cached = null;
      throw error;
    });
  cached = { expiresAt: Date.now() + 60_000, promise };
  return promise;
}

export function rotateFooterPlacements(
  placements: FeaturedPlacement[],
  path: string,
  day: string,
) {
  const ordered = [...placements].sort((a, b) =>
    a.homepage_slot_id.localeCompare(b.homepage_slot_id),
  );
  if (ordered.length <= 2) return ordered;
  let hash = 0;
  for (const char of `${path}|${day}`)
    hash = (Math.imul(hash, 31) + char.charCodeAt(0)) >>> 0;
  const start = hash % ordered.length;
  return [ordered[start], ordered[(start + 1) % ordered.length]];
}

export function eligibleFooterAdPath(path: string) {
  return (
    path === "/discover" ||
    path === "/rising" ||
    path === "/rankings" ||
    path === "/picks" ||
    path === "/collections" ||
    path === "/blog" ||
    /^\/apps\/[^/]+\/?$/.test(path) ||
    /^\/collections\/[^/]+\/?$/.test(path) ||
    /^\/blog\/[^/]+\/?$/.test(path) ||
    /^\/@[^/]+\/?$/.test(path) ||
    /^\/u\/[^/]+\/?$/.test(path)
  );
}
