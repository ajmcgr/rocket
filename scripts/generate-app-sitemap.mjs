import { existsSync, readFileSync, writeFileSync } from "node:fs";

// The public catalogue is the only input. This runs after the build copies the
// static sitemap into its public output, so no thousands-of-URLs source file is maintained.
const env = readFileSync(".env", "utf8");
const getEnv = (name) => process.env[name] || env.match(new RegExp(`^${name}=(.*)$`, "m"))?.[1]?.replace(/^['"]|['"]$/g, "");
const url = getEnv("VITE_SUPABASE_URL");
const key = getEnv("VITE_SUPABASE_PUBLISHABLE_KEY");
if (!url || !key) throw new Error("Public Supabase configuration is required to generate the app sitemap");

async function fetchPublicRows(table, select, order, extra = {}) {
  const rows = [];
  for (let offset = 0; ; offset += 1000) {
    const endpoint = new URL(`/rest/v1/${table}`, url);
    endpoint.searchParams.set("select", select);
    endpoint.searchParams.set("order", order);
    endpoint.searchParams.set("limit", "1000");
    endpoint.searchParams.set("offset", String(offset));
    for (const [name, value] of Object.entries(extra)) endpoint.searchParams.set(name, value);
    const response = await fetch(endpoint, { headers: { apikey: key }, signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`Public ${table} sitemap query failed: HTTP ${response.status}`);
    const page = await response.json();
    if (!Array.isArray(page)) throw new Error(`Public ${table} sitemap query returned invalid data`);
    rows.push(...page);
    if (page.length < 1000) break;
  }
  return rows;
}

const [apps, categories, collections, profiles] = await Promise.all([
  fetchPublicRows("public_discoverable_apps", "id,slug", "id.asc"),
  fetchPublicRows("public_app_categories", "category,app_count", "category.asc", { app_count: "gt.0" }),
  fetchPublicRows("public_user_collections", "slug,updated_at,app_count", "slug.asc", { app_count: "gt.0" }),
  fetchPublicRows("member_public_profiles", "username", "username.asc"),
]);
if (apps.some((item) => !/^[0-9a-f-]{36}$/i.test(item.id) || !/^[a-z0-9-]+$/.test(item.slug)))
  throw new Error("Public app sitemap returned invalid app IDs or slugs");
if (categories.some((item) => typeof item.category !== "string" || !item.category.trim() || !Number.isFinite(Number(item.app_count)) || Number(item.app_count) <= 0))
  throw new Error("Public category sitemap returned invalid or empty categories");
if (collections.some((item) => !/^[a-z0-9-]{1,100}$/.test(item.slug) || !Number.isFinite(Number(item.app_count)) || Number(item.app_count) <= 0))
  throw new Error("Public collection sitemap returned invalid or empty collections");
if (profiles.some((item) => !/^[a-z0-9_]{2,30}$/.test(item.username)))
  throw new Error("Public profile sitemap returned invalid usernames");

const sitemapPath = [".output/public/sitemap.xml", "dist/client/sitemap.xml", "dist/public/sitemap.xml", "dist/sitemap.xml"].find(existsSync);
if (!sitemapPath) throw new Error("Built public sitemap was not found");
const sitemap = readFileSync(sitemapPath, "utf8");
if (!sitemap.includes("</urlset>")) throw new Error("Built sitemap is not a URL set");
const entries = [
  ...apps.map(({ slug }) => `  <url><loc>https://tryrocket.ai/apps/${slug}</loc></url>`),
  ...categories.map(({ category }) => `  <url><loc>https://tryrocket.ai/discover?view=all&amp;category=${encodeURIComponent(category)}</loc></url>`),
  ...collections.map(({ slug, updated_at }) => {
    const changed = updated_at && !Number.isNaN(Date.parse(updated_at)) ? `<lastmod>${new Date(updated_at).toISOString()}</lastmod>` : "";
    return `  <url><loc>https://tryrocket.ai/collections/${slug}</loc>${changed}</url>`;
  }),
  ...profiles.map(({ username }) => `  <url><loc>https://tryrocket.ai/@${username}</loc></url>`),
].join("\n");
writeFileSync(sitemapPath, sitemap.replace("</urlset>", `${entries}\n</urlset>`));

console.log(`Generated sitemap entries for ${apps.length} apps, ${categories.length} categories, ${collections.length} public collections and ${profiles.length} public profiles`);
