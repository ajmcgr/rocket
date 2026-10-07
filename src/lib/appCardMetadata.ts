import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { marketplaceTable } from "./marketplace";

export type AppCardMetadata = Tables<"public_app_card_metadata"> & {
  average_rating?: number | null;
  developer_profile_username?: string | null;
  pricing_kind?: string;
  billing_model?: string;
};

export async function loadAppCardMetadata(ids: string[]): Promise<Map<string, AppCardMetadata>> {
  if (!ids.length) return new Map();
  const uniqueIds = [...new Set(ids)];
  const [{ data, error }, { data: ratings }] = await Promise.all([
    marketplaceTable("public_app_card_metadata")
      .select("app_id,save_count,rating_count,developer_handle,developer_profile_username,pricing_kind,billing_model")
      .in("app_id", uniqueIds),
    supabase.from("public_app_review_summary")
      .select("app_id,average_rating")
      .in("app_id", uniqueIds),
  ]);
  // Older deployments may not have the metadata view yet. No fabricated counts.
  if (error) return new Map();
  const averages = new Map((ratings || []).map((row) => [row.app_id, row.average_rating]));
  return new Map((data || []).map((row: AppCardMetadata) => [row.app_id, {
    ...row,
    average_rating: averages.get(row.app_id) ?? null,
  }]));
}
