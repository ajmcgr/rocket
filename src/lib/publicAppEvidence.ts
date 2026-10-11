import type { Tables } from "@/integrations/supabase/types";

type Traffic = Tables<"public_app_traction">;
type StripeRevenue = Tables<"public_app_revenue">;
type OtherRevenue = Tables<"public_app_verified_revenue">;

const trafficPriority: Record<string, number> = {
  active_users: 0,
  sessions: 1,
  views: 2,
};

const hasPublicTrafficValue = (point: Traffic) =>
  (point.visibility === "exact" && point.value !== null) ||
  (point.visibility === "range" && Boolean(point.value_range));

// A visible number is more useful in a shared profile. Within the same
// visibility level, unique active users are the clearest traffic signal.
export function featuredTraffic(points: Traffic[]): Traffic | null {
  return (
    [...points].sort(
      (left, right) =>
        Number(hasPublicTrafficValue(right)) -
          Number(hasPublicTrafficValue(left)) ||
        (trafficPriority[left.metric_type] ?? 3) -
          (trafficPriority[right.metric_type] ?? 3) ||
        right.metric_date.localeCompare(left.metric_date),
    )[0] ?? null
  );
}

// Public projections come from the revenue verification path. When provider
// selection is deployed, Supabase fences them to the selected provider. Never
// sum currencies or combine provider snapshots on the page.
export function featuredRevenue(
  alternative: OtherRevenue[],
  stripe: StripeRevenue[],
):
  | { source: "alternative"; point: OtherRevenue }
  | { source: "stripe"; point: StripeRevenue }
  | null {
  // A provider switch between the two parallel public reads can briefly yield
  // both snapshots. Hide revenue until a consistent read replaces them.
  if (alternative.length && stripe.length) return null;
  if (alternative.length)
    return { source: "alternative", point: alternative[0] };
  const point = [...stripe].sort(
    (left, right) =>
      Number(right.currency.toLowerCase() === "usd") -
        Number(left.currency.toLowerCase() === "usd") ||
      right.observed_at.localeCompare(left.observed_at),
  )[0];
  return point ? { source: "stripe", point } : null;
}
