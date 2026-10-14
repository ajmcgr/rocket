import { describe, expect, it, vi } from "vitest";
import {
  eligibleFooterAdPath,
  rotateFooterPlacements,
  type FeaturedPlacement,
} from "./featuredAds";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: vi.fn() } },
}));

const placements = Array.from({ length: 8 }, (_, index) => ({
  sponsorship_id: `${index + 1}`,
  sponsorship_type: "featured_app" as const,
  homepage_slot_id: `homepage_featured_${index + 1}`,
  destination_url: null,
  app: {
    id: `${index + 1}`,
    name: `App ${index + 1}`,
    slug: null,
    tagline: null,
    logo_url: null,
  },
})) satisfies FeaturedPlacement[];

describe("shared Featured App placements", () => {
  it("rotates the same inventory deterministically across days without repeating a card", () => {
    const first = rotateFooterPlacements(placements, "/discover", "2026-10-14");
    expect(
      rotateFooterPlacements(placements, "/discover", "2026-10-14"),
    ).toEqual(first);
    expect(first).toHaveLength(2);
    expect(new Set(first.map((item) => item.sponsorship_id)).size).toBe(2);
    expect(
      rotateFooterPlacements(placements, "/discover", "2026-10-15"),
    ).not.toEqual(first);
  });

  it("limits footer ads to public discovery and profile routes", () => {
    for (const path of [
      "/discover",
      "/rising",
      "/rankings",
      "/apps/launch",
      "/collections/tools",
      "/@alex",
      "/blog/post",
    ])
      expect(eligibleFooterAdPath(path)).toBe(true);
    for (const path of [
      "/",
      "/login",
      "/signup",
      "/auth/callback",
      "/advertise",
      "/my-apps/one",
      "/admin",
      "/pricing",
      "/privacy",
      "/claim-invitation",
    ])
      expect(eligibleFooterAdPath(path)).toBe(false);
  });
});
