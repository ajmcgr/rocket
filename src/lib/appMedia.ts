import { supabase } from "@/integrations/supabase/client";
import { publicMarketplaceRead } from "./publicMarketplaceCache";

export type PublicAppMedia = {
  id: string;
  app_id: string;
  media_type: "thumbnail" | "screenshot" | "video";
  source_url: string;
  sort_order: number;
  source_type: "launch" | "owner";
};

export async function loadAppMedia(
  appIds: string[],
  coversOnly = true,
): Promise<Map<string, PublicAppMedia[]>> {
  if (!appIds.length) return new Map();
  // The public view is security-invoker and exposes only public apps/media.
  const { data, error } = await publicMarketplaceRead("media", `${coversOnly}:${[...appIds].sort().join(",")}`, () => supabase
    .from(coversOnly ? "public_app_media_covers" : "public_app_media")
    .select("id,app_id,media_type,source_url,sort_order,source_type")
    .in("app_id", appIds)
    .order("sort_order", { ascending: true })
    .limit(coversOnly ? appIds.length : Math.min(600, appIds.length * 25)));
  if (error) return new Map(); // Legacy deployments can still render logo-only cards.
  const result = new Map<string, PublicAppMedia[]>();
  for (const row of (data || []) as PublicAppMedia[]) {
    const current = result.get(row.app_id) || [];
    current.push(row);
    result.set(row.app_id, current);
  }
  return result;
}

export function coverMedia(media: PublicAppMedia[] = []) {
  return (
    media.find(
      (item) => item.source_type === "owner" && item.media_type === "thumbnail",
    ) ||
    media.find(
      (item) =>
        item.source_type === "owner" && item.media_type === "screenshot",
    ) ||
    media.find((item) => item.media_type === "thumbnail") ||
    media.find((item) => item.media_type === "screenshot")
  );
}

export function optimizedMediaUrl(
  sourceUrl: string,
  width: number,
  height: number,
  resize: "cover" | "contain",
) {
  try {
    const url = new URL(sourceUrl);
    if (!url.pathname.includes("/storage/v1/object/public/")) return sourceUrl;
    url.pathname = url.pathname.replace(
      "/storage/v1/object/public/",
      "/storage/v1/render/image/public/",
    );
    url.searchParams.set("width", String(width));
    url.searchParams.set("height", String(height));
    url.searchParams.set("resize", resize);
    url.searchParams.set("quality", "75");
    return url.toString();
  } catch {
    return sourceUrl;
  }
}
