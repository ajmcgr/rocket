import { supabase } from "@/integrations/supabase/client";
import type { Database, Tables } from "@/integrations/supabase/types";
import type { SupabaseClient } from "@supabase/supabase-js";
type Details = {
  app_id: string;
  pricing_kind: string;
  billing_model: string;
  outcome: string | null;
  prerequisites: string | null;
  additional_costs: string | null;
  support_url: string | null;
  privacy_url: string | null;
};
type Relation<Row> = {
  Row: Row;
  Insert: Partial<Row>;
  Update: Partial<Row>;
  Relationships: [];
};
type MarketplaceRelations = {
  public_marketplace_details: Relation<Details>;
  marketplace_follows: Relation<{
    user_id: string;
    target: string;
    created_at: string;
  }>;
  app_releases: Relation<{
    id: string;
    app_id: string;
    version: string;
    notes: string;
    created_at: string;
  }>;
  app_review_responses: Relation<{
    review_id: string;
    body: string;
    updated_at: string;
  }>;
  public_rocket_picks: Relation<{
    app_id: string;
    headline: string | null;
    collection: string | null;
    featured_at: string;
    placement: string;
  }>;
  public_app_card_metadata: Relation<
    Tables<"public_app_card_metadata"> & {
      developer_profile_username: string | null;
      pricing_kind: string;
      billing_model: string;
    }
  >;
};
type PendingDatabase = Omit<Database, "public"> & {
  public: Omit<Database["public"], "Tables" | "Views"> & {
    Tables: MarketplaceRelations;
    Views: Record<never, never>;
  };
};
type RpcResults = {
  search_marketplace: { apps: Tables<"public_apps">[]; total: number };
  get_app_developer: { username: string; full_name: string } | null;
  get_public_member_apps: Tables<"public_apps">[];
  get_app_review_purchase_labels: {
    review_id: string;
    purchase_label: string;
  }[];
  moderate_app_reports: { id: string; app_id: string; reason: string }[];
  set_app_marketplace_details: null;
  set_marketplace_follow: null;
  publish_app_release: null;
  respond_app_review: null;
  report_marketplace_app: null;
  set_rocket_pick_collection: null;
};
// Narrow typed boundary for review-pending migrations; generated types are not
// regenerated against production before the migration has been approved.
export async function marketplaceRpc<Name extends keyof RpcResults>(
  name: Name,
  args: Record<string, unknown>,
): Promise<{
  data: RpcResults[Name] | null;
  error: { message: string } | null;
}> {
  return (
    supabase.rpc as unknown as (
      name: string,
      args: Record<string, unknown>,
    ) => Promise<{
      data: RpcResults[Name] | null;
      error: { message: string } | null;
    }>
  )(name, args);
}
export const marketplaceTable = <Name extends keyof MarketplaceRelations>(
  name: Name,
) => (supabase as unknown as SupabaseClient<PendingDatabase>).from(name);
export function sourceAttribution(search: string) {
  const source = new URLSearchParams(search).get("utm_source");
  return source === "rocket_badge" || source === "rocket_share"
    ? source
    : "direct";
}
export function recordOutbound(appId: string) {
  if (
    typeof window === "undefined" ||
    !["https://tryrocket.ai", "https://www.tryrocket.ai"].includes(
      window.location.origin,
    )
  )
    return;
  void supabase.functions
    .invoke("rocket-app-view", {
      body: {
        app_id: appId,
        kind: "outbound",
        source: sourceAttribution(window.location.search),
      },
    })
    .catch(() => {});
}
