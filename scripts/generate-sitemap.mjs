import { readFileSync, writeFileSync } from "node:fs";

const templatesSource = readFileSync("src/data/templates.ts", "utf8");
const sitemapPath = "public/sitemap.xml";
const sitemap = readFileSync(sitemapPath, "utf8");

// Only a template explicitly marked indexable is published. This keeps draft,
// incomplete, or internal templates out of search without maintaining URLs by hand.
const entries = [...templatesSource.matchAll(/id:\s*"([^"]+)"[\s\S]*?indexable:\s*true,/g)]
  .map((match) => match[1])
  .map((id) => `  <url><loc>https://tryrocket.ai/brand-templates/${id}</loc><priority>0.7</priority></url>`)
  .join("\n");

const next = sitemap.replace(
  /  <!-- BRAND_TEMPLATE_URLS_START -->[\s\S]*?  <!-- BRAND_TEMPLATE_URLS_END -->/,
  `  <!-- BRAND_TEMPLATE_URLS_START -->\n${entries}\n  <!-- BRAND_TEMPLATE_URLS_END -->`,
);

if (next === sitemap && !sitemap.includes("BRAND_TEMPLATE_URLS_START")) {
  throw new Error("Brand template sitemap markers are missing.");
}

writeFileSync(sitemapPath, next);
