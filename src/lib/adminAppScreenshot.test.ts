import { describe, expect, it } from "vitest";
import type { Tables } from "@/integrations/supabase/types";
import { screenshotImages, screenshotMetrics } from "./adminAppScreenshot";

const traffic = (
  visibility: string,
  value: number | null,
  value_range: string | null = null,
) =>
  ({
    app_id: "app",
    metric_type: "active_users",
    visibility,
    value,
    value_range,
    metric_date: "2026-10-14",
    provider: "ga4",
    last_verified_at: "2026-10-15T00:00:00Z",
  }) as Tables<"public_app_traction">;
const stripe = (visibility: string, mrr_minor: number | null) =>
  ({
    app_id: "app",
    currency: "usd",
    metric_type: "mrr",
    visibility,
    mrr_minor,
    range_lower_minor: null,
    range_upper_minor: null,
    observed_at: "2026-10-14T00:00:00Z",
    last_verified_at: "2026-10-15T00:00:00Z",
    provider: "stripe",
  }) as Tables<"public_app_revenue">;

describe("admin app screenshot data", () => {
  it("includes only values explicitly visible in the public projections", () => {
    expect(
      screenshotMetrics(
        [traffic("exact", 5000)],
        [stripe("private", 100000)],
        [],
      ),
    ).toEqual([
      {
        label: "Daily active users",
        value: "5K",
        source: "Google Analytics · 2026-10-14",
      },
    ]);
    expect(
      screenshotMetrics(
        [traffic("private", 5000)],
        [stripe("exact", 123400)],
        [],
      ),
    ).toEqual([
      {
        label: "Monthly recurring revenue",
        value: "$1,234.00",
        source: "Stripe · Snapshot 2026-10-14",
      },
    ]);
    expect(
      screenshotMetrics(
        [traffic("range", null, null)],
        [stripe("exact", null)],
        [],
      ),
    ).toEqual([]);
    expect(
      screenshotMetrics(
        [],
        [{ ...stripe("verified_only", null), revenue_scope: "account" }],
        [],
      ),
    ).toEqual([
      {
        label: "Stripe account MRR",
        value: "Verified",
        source: "Stripe · Snapshot 2026-10-14",
      },
    ]);
  });

  it("hides revenue if conflicting providers appear during a provider switch", () => {
    const alternative = {
      app_id: "app",
      provider: "revenuecat",
      metric_type: "subscription_mrr",
      visibility: "exact",
      currency: "usd",
      value_minor: 10000,
      range_lower_minor: null,
      range_upper_minor: null,
      period_start: null,
      period_end: null,
      observed_at: "2026-10-14T00:00:00Z",
      verified_at: "2026-10-15T00:00:00Z",
      mapping_version: 1,
    } as Tables<"public_app_verified_revenue">;
    expect(
      screenshotMetrics([], [stripe("exact", 10000)], [alternative]),
    ).toEqual([]);
  });

  it("uses actual public product images and prioritizes owner uploads", () => {
    const media = [
      { id: "video", media_type: "video", source_type: "owner", sort_order: 0 },
      {
        id: "launch",
        media_type: "screenshot",
        source_type: "launch",
        sort_order: 0,
      },
      {
        id: "owner",
        media_type: "screenshot",
        source_type: "owner",
        sort_order: 1,
      },
    ] as Tables<"public_app_media">[];
    expect(
      screenshotImages(media as Parameters<typeof screenshotImages>[0]).map(
        (item) => item.id,
      ),
    ).toEqual(["owner", "launch"]);
  });
});
