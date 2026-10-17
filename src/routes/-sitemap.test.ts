import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { docArticles } from "@/content/rocketDocs";

async function getSitemap() {
  const { Route } = await import("./sitemap[.]xml");
  const handler = Route.options.server?.handlers?.GET as (
    context: never,
  ) => Promise<Response>;
  return handler({} as never);
}

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("VITE_SUPABASE_URL", "https://rocket.test");
  vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "test-key");
  vi.stubGlobal(
    "AbortSignal",
    Object.assign(class {}, { timeout: () => undefined }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("dynamic public sitemap", () => {
  it("includes current app, category, collection, and profile URLs", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://rocket.test");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "test-key");
    vi.stubGlobal(
      "AbortSignal",
      Object.assign(class {}, { timeout: () => undefined }),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = new URL(String(input));
        const rows: Record<string, unknown[]> = {
          public_app_sitemap: [
            { slug: "fresh-app", updated_at: "2026-10-16T00:00:00Z" },
          ],
          public_app_categories: [
            { category: "Design & Creative", app_count: 4 },
          ],
          public_user_collections: [
            { slug: "staff-picks", updated_at: null, app_count: 2 },
          ],
          member_public_profiles: [{ username: "builder_1" }],
        };
        return new Response(
          JSON.stringify(rows[url.pathname.split("/").at(-1)!] || []),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }),
    );

    const response = await getSitemap();
    const xml = await response.text();
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("application/xml");
    expect(xml).toContain("https://tryrocket.ai/apps/fresh-app");
    expect(xml).toContain(
      "https://tryrocket.ai/discover?view=all&amp;category=Design+%26+Creative",
    );
    expect(xml).toContain("https://tryrocket.ai/collections/staff-picks");
    expect(xml).toContain("https://tryrocket.ai/@builder_1");
    expect(xml).toContain("<loc>https://tryrocket.ai/docs</loc>");
    for (const article of docArticles)
      expect(xml).toContain(
        `<loc>https://tryrocket.ai/docs/${article.slug}</loc>`,
      );
    expect(xml).toContain("<lastmod>2026-10-16T00:00:00.000Z</lastmod>");
    const locations = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(
      (match) => match[1],
    );
    expect(new Set(locations).size).toBe(locations.length);
    expect(Number(response.headers.get("X-Rocket-Sitemap-URL-Count"))).toBe(
      locations.length,
    );
    await getSitemap();
    expect(fetch).toHaveBeenCalledTimes(4);
  });
  it("returns a retryable error instead of an incomplete sitemap when the catalogue is unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("Unavailable", { status: 503 })),
    );
    const response = await getSitemap();
    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("60");
  });
});
