import { createFileRoute } from "@tanstack/react-router";
import staticSitemap from "@/data/sitemap-static.xml?raw";

const baseUrl = "https://tryrocket.ai";
const pageSize = 1000;
const sitemapLimit = 50_000;

type SitemapRow = Record<string, unknown>;

function xmlEscape(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

async function fetchPublicRows(
  table: string,
  select: string,
  order: string,
  filters: Record<string, string> = {},
) {
  const endpointBase = import.meta.env.VITE_SUPABASE_URL;
  const apiKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!endpointBase || !apiKey)
    throw new Error("Public catalogue configuration is unavailable");
  const rows: SitemapRow[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const endpoint = new URL(`/rest/v1/${table}`, endpointBase);
    endpoint.searchParams.set("select", select);
    endpoint.searchParams.set("order", order);
    endpoint.searchParams.set("limit", String(pageSize));
    endpoint.searchParams.set("offset", String(offset));
    for (const [name, value] of Object.entries(filters))
      endpoint.searchParams.set(name, value);
    const response = await fetch(endpoint, {
      headers: { apikey: apiKey, Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok)
      throw new Error(
        `Public sitemap query failed for ${table}: ${response.status}`,
      );
    const page: unknown = await response.json();
    if (!Array.isArray(page))
      throw new Error(`Public sitemap query returned invalid ${table} data`);
    rows.push(...page);
    if (page.length < pageSize) break;
    if (rows.length > sitemapLimit)
      throw new Error("Sitemap has exceeded the single-file URL limit");
  }
  return rows;
}

function urlEntry(loc: string, lastmod?: string | null, priority?: string) {
  const date =
    lastmod && !Number.isNaN(Date.parse(lastmod))
      ? `<lastmod>${new Date(lastmod).toISOString()}</lastmod>`
      : "";
  const rank = priority ? `<priority>${priority}</priority>` : "";
  return `  <url><loc>${xmlEscape(loc)}</loc>${date}${rank}</url>`;
}

function buildSitemap(entries: string[]) {
  return staticSitemap
    .replace(/<url>[\s\S]*?<\/url>/g, "")
    .replace("</urlset>", `${entries.join("\n")}\n</urlset>`);
}

async function getSitemap() {
  const [apps, categories, collections, profiles] = await Promise.all([
    fetchPublicRows("public_app_sitemap", "slug,updated_at", "slug.asc"),
    fetchPublicRows(
      "public_app_categories",
      "category,app_count",
      "category.asc",
      { app_count: "gt.0" },
    ),
    fetchPublicRows(
      "public_user_collections",
      "slug,updated_at,app_count",
      "slug.asc",
      { app_count: "gt.0" },
    ),
    fetchPublicRows("member_public_profiles", "username", "username.asc"),
  ]);
  const entries = new Map<string, string>();
  const staticLocations = [
    ...staticSitemap.matchAll(/<url>\s*<loc>([^<]+)<\/loc>([\s\S]*?)<\/url>/g),
  ];
  for (const [, loc, content] of staticLocations)
    entries.set(
      loc.replaceAll("&amp;", "&"),
      `  <url><loc>${loc}</loc>${content}</url>`,
    );

  for (const row of apps) {
    if (
      typeof row.slug !== "string" ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(row.slug)
    )
      continue;
    const loc = `${baseUrl}/apps/${row.slug}`;
    entries.set(
      loc,
      urlEntry(loc, typeof row.updated_at === "string" ? row.updated_at : null),
    );
  }
  for (const row of categories) {
    if (
      typeof row.category !== "string" ||
      !row.category.trim() ||
      Number(row.app_count) <= 0
    )
      continue;
    const params = new URLSearchParams({ view: "all", category: row.category });
    const loc = `${baseUrl}/discover?${params}`;
    entries.set(loc, urlEntry(loc));
  }
  for (const row of collections) {
    if (
      typeof row.slug !== "string" ||
      !/^[a-z0-9-]{1,100}$/.test(row.slug) ||
      Number(row.app_count) <= 0
    )
      continue;
    const loc = `${baseUrl}/collections/${row.slug}`;
    entries.set(
      loc,
      urlEntry(loc, typeof row.updated_at === "string" ? row.updated_at : null),
    );
  }
  for (const row of profiles) {
    if (
      typeof row.username !== "string" ||
      !/^[a-z0-9_]{2,30}$/.test(row.username)
    )
      continue;
    const loc = `${baseUrl}/@${row.username}`;
    entries.set(loc, urlEntry(loc));
  }
  if (entries.size > sitemapLimit)
    throw new Error("Sitemap has exceeded the single-file URL limit");
  return {
    xml: buildSitemap([...entries.values()]),
    count: entries.size,
    apps: apps.length,
  };
}

type Sitemap = Awaited<ReturnType<typeof getSitemap>>;
let cached: { sitemap: Sitemap; refreshedAt: number } | undefined;
let refreshing: Promise<Sitemap> | undefined;

async function currentSitemap() {
  if (cached && Date.now() - cached.refreshedAt < 15 * 60 * 1000)
    return cached.sitemap;
  if (!refreshing)
    refreshing = getSitemap()
      .then((sitemap) => {
        cached = { sitemap, refreshedAt: Date.now() };
        return sitemap;
      })
      .finally(() => {
        refreshing = undefined;
      });
  return refreshing;
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const { xml, count } = await currentSitemap();
          return new Response(xml, {
            headers: {
              "Content-Type": "application/xml; charset=utf-8",
              "Cache-Control":
                "public, max-age=0, s-maxage=900, stale-while-revalidate=300, stale-if-error=86400",
              "X-Rocket-Sitemap-URL-Count": String(count),
            },
          });
        } catch (error) {
          console.error("Dynamic sitemap refresh failed", error);
          // Let shared caches keep their last successful sitemap during an outage.
          // Returning a truncated URL set could tell crawlers that apps disappeared.
          return new Response(
            "Sitemap temporarily unavailable. Please retry.",
            {
              status: 503,
              headers: {
                "Content-Type": "text/plain; charset=utf-8",
                "Cache-Control": "no-store",
                "Retry-After": "60",
              },
            },
          );
        }
      },
    },
  },
});
