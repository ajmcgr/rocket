import { existsSync, readFileSync, writeFileSync } from "node:fs";

// The public catalogue is the only input. This runs after the build copies the
// static sitemap into its public output, so no thousands-of-URLs source file is maintained.
const env = readFileSync(".env", "utf8");
const getEnv = (name) => process.env[name] || env.match(new RegExp(`^${name}=(.*)$`, "m"))?.[1]?.replace(/^['"]|['"]$/g, "");
const url = getEnv("VITE_SUPABASE_URL");
const key = getEnv("VITE_SUPABASE_PUBLISHABLE_KEY");
if (!url || !key) throw new Error("Public Supabase configuration is required to generate the app sitemap");

const apps = [];
for (let offset = 0; ; offset += 1000) {
  const endpoint = new URL("/rest/v1/public_apps", url);
  endpoint.searchParams.set("select", "id");
  endpoint.searchParams.set("order", "id.asc");
  endpoint.searchParams.set("limit", "1000");
  endpoint.searchParams.set("offset", String(offset));
  const response = await fetch(endpoint, { headers: { apikey: key }, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Public app sitemap query failed: HTTP ${response.status}`);
  const page = await response.json();
  if (!Array.isArray(page) || page.some((item) => !/^[0-9a-f-]{36}$/i.test(item.id)))
    throw new Error("Public app sitemap returned invalid IDs");
  apps.push(...page);
  if (page.length < 1000) break;
}

const sitemapPath = [".output/public/sitemap.xml", "dist/sitemap.xml"].find(existsSync);
if (!sitemapPath) throw new Error("Built public sitemap was not found");
const sitemap = readFileSync(sitemapPath, "utf8");
if (!sitemap.includes("</urlset>")) throw new Error("Built sitemap is not a URL set");
const entries = apps.map(({ id }) => `  <url><loc>https://tryrocket.ai/apps/${id}</loc></url>`).join("\n");
writeFileSync(sitemapPath, sitemap.replace("</urlset>", `${entries}\n</urlset>`));

console.log(`Generated sitemap entries for ${apps.length} public app profiles`);
