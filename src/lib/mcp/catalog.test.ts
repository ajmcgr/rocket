import { describe, expect, it, vi } from "vitest";
import { PublicCatalogue, appProfileUrl, boundedLimit } from "./catalog";

const app = {
  id: "11111111-1111-4111-8111-111111111111", slug: "rocket-test", name: "Rocket Test",
  tagline: "A public app", description: "Public description", website_url: "https://example.com",
  categories: ["Productivity"], platforms: ["web"], launched_at: "2026-10-01T00:00:00Z",
};

function catalogue(rows: Record<string, unknown>) {
  const fetcher = vi.fn(async (input: URL, init?: RequestInit) => {
    expect(init?.headers).toMatchObject({ apikey: "anon-key", Authorization: "Bearer anon-key" });
    const key = input.pathname.replace("/rest/v1/", "");
    return new Response(JSON.stringify(rows[key] ?? []), { status: 200 });
  });
  return { api: new PublicCatalogue("https://public.example", "anon-key", fetcher as typeof fetch), fetcher };
}

describe("public MCP catalogue", () => {
  it("searches public apps and provides attributable profile links", async () => {
    const { api, fetcher } = catalogue({
      "rpc/search_marketplace": { apps: [app], total: 1 },
      public_app_review_summary: [{ app_id: app.id, average_rating: 4.5, rating_count: 2 }],
    });
    const result = await api.search("rocket", "Productivity", 5);
    expect(result.apps[0]).toMatchObject({ name: "Rocket Test", public_rating: { average: 4.5, count: 2 } });
    expect(result.apps[0].rocket_profile_url).toBe(appProfileUrl("rocket-test"));
    expect(result.apps[0].rocket_profile_url).toContain("utm_source=rocket_mcp");
    expect(JSON.parse(fetcher.mock.calls[0][1]?.body as string)).toMatchObject({ p_query: "rocket", p_limit: 5 });
  });

  it("returns only public app data and redacts private metric values", async () => {
    const { api, fetcher } = catalogue({
      public_discoverable_apps: [app], public_app_review_summary: [],
      "rpc/get_app_developer": { username: "maker", full_name: "Maker" },
      public_app_traction: [
        { provider: "ga4", metric_type: "daily_active_users", visibility: "verified_only", value: 98765, value_range: null },
        { provider: "posthog", metric_type: "pageviews", visibility: "private", value: 123456, value_range: null },
      ],
      public_app_revenue: [{ provider: "stripe", metric_type: "mrr", visibility: "verified_only", currency: "USD", mrr_minor: 777777 }],
      public_app_verified_revenue: [],
    });
    const result = await api.getApp("rocket-test");
    expect(result.developer).toMatchObject({ handle: "@maker", profile_url: "https://tryrocket.ai/@maker" });
    expect(JSON.stringify(result)).not.toMatch(/98765|123456|777777/);
    expect(result.public_verified_metrics).toHaveLength(2);
    expect(fetcher.mock.calls.every(([, init]) => !JSON.stringify(init).includes("service_role"))).toBe(true);
  });

  it("lists categories and uses the existing Rising ordering", async () => {
    const { api, fetcher } = catalogue({
      public_app_categories: [{ category: "Productivity", app_count: 12 }],
      public_app_rankings: [{ app_id: app.id, rocket_view_count: 19 }],
      public_discoverable_apps: [app], public_app_review_summary: [],
    });
    expect(await api.categories()).toEqual([{ name: "Productivity", app_count: 12, url: "https://tryrocket.ai/discover?view=all&category=Productivity" }]);
    expect((await api.trending("Productivity", 5))[0]).toMatchObject({ slug: "rocket-test", rocket_page_views: 19 });
    const rankingUrl = fetcher.mock.calls.find(([url]) => url.pathname.endsWith("public_app_rankings"))?.[0];
    expect(rankingUrl?.searchParams.get("order")).toBe("rocket_view_count.desc,last_viewed_at.desc.nullslast,launched_at.desc.nullslast,app_id.asc");
  });

  it("rejects malformed inputs and oversized public responses", async () => {
    const { api } = catalogue({});
    await expect(api.search(" ")).rejects.toThrow("query is required");
    await expect(api.getApp("bad/slug")).rejects.toThrow("Invalid app ID");
    expect(() => boundedLimit(11)).toThrow("limit must be an integer");
    const oversized = new PublicCatalogue("https://public.example", "anon-key", vi.fn(async () => new Response("x".repeat(200_001))) as typeof fetch);
    await expect(oversized.categories()).rejects.toThrow("exceeded limit");
  });
});
