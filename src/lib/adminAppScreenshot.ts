import type { Tables } from "@/integrations/supabase/types";
import type { PublicAppMedia } from "@/lib/appMedia";
import { featuredRevenue, featuredTraffic } from "@/lib/publicAppEvidence";
import { publicRevenueValue, publicTrafficValue } from "@/components/PublicMetricCard";

type Traffic = Tables<"public_app_traction">;
type StripeRevenue = Tables<"public_app_revenue">;
type OtherRevenue = Tables<"public_app_verified_revenue">;

export type ScreenshotMetric = { label: string; value: string; source: string };

// These rows are fetched from the same public, consent- and freshness-gated
// projections as the app profile. Never turn a private placeholder into a card.
export function screenshotMetrics(
  traffic: Traffic[],
  stripeRevenue: StripeRevenue[],
  otherRevenue: OtherRevenue[],
): ScreenshotMetric[] {
  const result: ScreenshotMetric[] = [];
  const trafficPoint = featuredTraffic(traffic.filter((point) =>
    point.visibility === "exact" || point.visibility === "range",
  ));
  if (trafficPoint) {
    const value = publicTrafficValue(
      trafficPoint.visibility,
      trafficPoint.value,
      trafficPoint.value_range,
    );
    if (value !== "Private") result.push({
      label: {
        active_users: "Daily active users",
        sessions: "Daily sessions",
        views: "Daily views",
      }[trafficPoint.metric_type] || trafficPoint.metric_type,
      value,
      source: `${trafficPoint.provider === "ga4" ? "Google Analytics" : trafficPoint.provider} · ${trafficPoint.metric_date}`,
    });
  }

  const revenue = featuredRevenue(otherRevenue, stripeRevenue);
  if (revenue) {
    const value = revenue.source === "stripe"
      ? publicRevenueValue(revenue.point.visibility, revenue.point.mrr_minor, revenue.point.range_lower_minor, revenue.point.range_upper_minor, revenue.point.currency)
      : publicRevenueValue(revenue.point.visibility, revenue.point.value_minor, revenue.point.range_lower_minor, revenue.point.range_upper_minor, revenue.point.currency);
    if (value !== "Private") result.push({
      label: revenue.source === "stripe"
        ? "Monthly recurring revenue"
        : revenue.point.metric_type === "gross_revenue_30d"
          ? "Gross revenue · previous 30 days"
          : revenue.point.metric_type === "paid_volume_30d"
            ? "Succeeded payment volume · previous 30 days"
            : "Subscription MRR",
      value,
      source: revenue.source === "stripe"
        ? `Stripe · Snapshot ${revenue.point.observed_at.slice(0, 10)}`
        : `${revenue.point.provider === "revenuecat" ? "RevenueCat" : revenue.point.provider} · Verified ${revenue.point.verified_at.slice(0, 10)}`,
    });
  }
  return result;
}

export function screenshotImages(media: PublicAppMedia[]): PublicAppMedia[] {
  return media
    .filter((item) => item.media_type === "screenshot" || item.media_type === "thumbnail")
    .sort((left, right) =>
      Number(right.source_type === "owner") - Number(left.source_type === "owner") ||
      left.sort_order - right.sort_order,
    )
    .slice(0, 3);
}
