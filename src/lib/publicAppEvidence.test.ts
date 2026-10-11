import { expect, it } from "vitest";
import type { Tables } from "@/integrations/supabase/types";
import { featuredRevenue, featuredTraffic } from "./publicAppEvidence";

it("shows one useful traffic signal while respecting hidden values", () => {
  const point = (metric_type: string, visibility: string) =>
    ({
      metric_type,
      visibility,
      value: visibility === "exact" ? 120 : null,
      value_range: null,
      metric_date: "2026-10-10",
      provider: "ga4",
    }) as Tables<"public_app_traction">;
  expect(
    featuredTraffic([
      point("views", "exact"),
      point("sessions", "exact"),
      point("active_users", "verified_only"),
    ])?.metric_type,
  ).toBe("sessions");
  expect(
    featuredTraffic([point("views", "exact"), point("active_users", "exact")])
      ?.metric_type,
  ).toBe("active_users");
});

it("shows one selected revenue snapshot and hides inconsistent provider reads", () => {
  const stripe = {
    currency: "usd",
    observed_at: "2026-10-10",
    provider: "stripe",
  } as Tables<"public_app_revenue">;
  const revenuecat = {
    provider: "revenuecat",
  } as Tables<"public_app_verified_revenue">;
  expect(featuredRevenue([], [stripe])).toEqual({
    source: "stripe",
    point: stripe,
  });
  expect(featuredRevenue([revenuecat], [])).toEqual({
    source: "alternative",
    point: revenuecat,
  });
  expect(featuredRevenue([revenuecat], [stripe])).toBeNull();
});
