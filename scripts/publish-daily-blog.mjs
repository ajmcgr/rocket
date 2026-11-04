import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { coverSvg, coverVariantCount } from "./blog-cover.mjs";

const articlesPath = join(process.cwd(), "src/content/articles.ts");
const coversPath = join(process.cwd(), "public/blog-covers");
const apiKey = process.env.GEMINI_API_KEY;
const model = process.env.GEMINI_BLOG_MODEL || "gemini-2.5-flash";

const categories = new Set([
  "App Development", "Vibe Coding", "Launch & Distribution", "Growth", "Monetization",
  "App Discovery", "Product Design", "Founder Stories", "Tutorials", "Rocket Updates",
]);

const topics = [
  { title: "How to Validate a Vibe-Coded App Before Building More Features", keywords: ["validate a vibe-coded app", "before building more features"] },
  { title: "A Practical Launch Checklist for an Independent App", keywords: ["launch checklist for an independent app"] },
  { title: "How to Write an App Listing That Explains What Your Product Does", keywords: ["app listing that explains", "write an app listing"] },
  { title: "What to Measure After Your App's First Public Launch", keywords: ["measure after your app", "first public launch"] },
  { title: "How to Turn Early App Feedback Into a Better Onboarding Flow", keywords: ["early app feedback", "better onboarding flow"] },
  { title: "A Simple Distribution Plan for a Solo App Developer", keywords: ["distribution plan for a solo app developer"] },
  { title: "How to Decide Which Vibe-Coded Features Are Ready to Ship", keywords: ["vibe-coded features", "ready to ship"] },
  { title: "How to Price a Small App Without Guessing at Every Number", keywords: ["price a small app", "guessing at every number"] },
  { title: "How to Improve App Discovery With Clear Categories and Screenshots", keywords: ["app discovery with clear categories", "categories and screenshots"] },
  { title: "The First-Week Support Checklist for a Newly Launched App", keywords: ["first-week support checklist", "newly launched app"] },
  { title: "When to Add Sign-In or Payments to an Early-Stage App", keywords: ["sign-in or payments", "early-stage app"] },
  { title: "How to Maintain Trust When Your App Changes Quickly", keywords: ["maintain trust when your app", "app changes quickly"] },
];

const dateInBangkok = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const value = (type) => parts.find((part) => part.type === type)?.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
};

const publishDate = process.env.BLOG_PUBLISH_DATE || dateInBangkok();

if (!/^\d{4}-\d{2}-\d{2}$/.test(publishDate)) {
  throw new Error("BLOG_PUBLISH_DATE must use YYYY-MM-DD.");
}

const cleanText = (value, field, max) => {
  if (typeof value !== "string") throw new Error(`Gemini returned an invalid ${field}.`);
  const result = value.trim();
  if (!result || result.length > max) throw new Error(`Gemini returned an invalid ${field}.`);
  return result;
};

const shorten = (value, max) => {
  if (value.length <= max) return value;
  const cutoff = value.slice(0, max - 1).lastIndexOf(" ");
  return `${value.slice(0, cutoff > 0 ? cutoff : max - 1).trim()}…`;
};

const slugify = (value) => value
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "")
  .slice(0, 100);

const parseArticle = (value, source) => {
  const title = cleanText(value.title, "title", 100);
  const slug = slugify(typeof value.slug === "string" ? value.slug : title);
  const excerptSource = value.excerpt ?? value.summary ?? value.description;
  const excerpt = shorten(cleanText(excerptSource, "excerpt", 1_000), 320);
  const body = cleanText(value.body, "body", 16_000);
  const category = categories.has(value.category) ? value.category : "App Development";
  const tags = Array.isArray(value.tags)
    ? [...new Set(value.tags.map((tag) => cleanText(tag, "tag", 48).toLowerCase()))].slice(0, 4)
    : ["app development", "indie developers"];
  const words = body.split(/\s+/).filter(Boolean).length;

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error("Gemini returned an invalid slug.");
  if (source.includes(`slug: "${slug}"`)) throw new Error(`A post with slug ${slug} already exists.`);
  if (tags.length < 2 || words < 650 || words > 1_500) throw new Error("Gemini returned an article outside the required quality bounds.");
  return { title, slug, excerpt, body, category, tags, readTime: `${Math.max(3, Math.round(words / 220))} min` };
};

const articleSource = await readFile(articlesPath, "utf8");
if (articleSource.includes(`date: "${publishDate}"`)) {
  console.log(`A post is already published for ${publishDate}; nothing to do.`);
  process.exit(0);
}
if (!apiKey) throw new Error("GEMINI_API_KEY is required to publish the daily blog post.");

const dateSeed = Number(publishDate.replaceAll("-", ""));
const topic = topics.find((candidate) => !candidate.keywords.some((keyword) => articleSource.toLowerCase().includes(keyword)))
  || topics[dateSeed % topics.length];

const prompt = `Write one original Rocket blog post for independent app developers and vibe coders. Return JSON only, matching this exact shape:
{"title":"...","slug":"lowercase-hyphenated","excerpt":"...","category":"one allowed category","tags":["tag","tag"],"body":"Markdown article"}

Topic: ${topic.title}
Publication date: ${publishDate}
Allowed categories: ${[...categories].join(", ")}.

The article must be 650–1,500 words, useful and specific, and written in a clear editorial voice for people building, shipping, and growing software, including AI-assisted and vibe-coded apps. Keep the excerpt to one sentence of 220 characters or fewer. Focus on practical product validation, development, onboarding, distribution, app discovery, user feedback, or monetization as the topic warrants. Avoid making logos, visual identity, or design assets the main subject unless the assigned topic specifically requires them. Rocket is an open app platform where people can discover apps and developers can submit app listings. Mention Rocket only where naturally relevant and never claim features, customers, outcomes, integrations, pricing, or statistics that are not supplied here. Do not use invented quotes, citations, case studies, or unverifiable facts. Do not use a title heading in the body. Include 3–5 practical sections with Markdown ## headings and one short useful list. Avoid generic AI-content filler, repeated points, and competitor comparisons.`;

const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: "application/json", temperature: 0.65 },
  }),
});

if (!response.ok) throw new Error(`Gemini request failed (${response.status}): ${await response.text()}`);
const payload = await response.json();
const text = payload?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("");
if (!text) throw new Error("Gemini returned no article content.");

let raw;
try {
  raw = JSON.parse(text.replace(/^```json\s*|\s*```$/g, ""));
} catch {
  throw new Error("Gemini returned invalid JSON.");
}

const article = parseArticle(raw, articleSource);
const coverFilename = `${article.slug}.svg`;
const entry = `  {\n    slug: ${JSON.stringify(article.slug)},\n    title: ${JSON.stringify(article.title)},\n    excerpt: ${JSON.stringify(article.excerpt)},\n    readTime: ${JSON.stringify(article.readTime)},\n    date: ${JSON.stringify(publishDate)},\n    category: ${JSON.stringify(article.category)},\n    tags: ${JSON.stringify(article.tags)},\n    cover: ${JSON.stringify(`/blog-covers/${coverFilename}`)},\n    body: md(${JSON.stringify(article.body)}),\n  },`;
const marker = "export const articles: Article[] = [";
if (!articleSource.includes(marker)) throw new Error("The articles insertion marker is missing.");

await mkdir(coversPath, { recursive: true });
const latestCover = articleSource.match(/cover: "\/blog-covers\/([^"/]+\.svg)"/)?.[1];
const latestCoverSvg = latestCover ? await readFile(join(coversPath, latestCover), "utf8").catch(() => "") : "";
const latestVariant = Number(latestCoverSvg.match(/data-variant="(\d+)"/)?.[1]);
const nextVariant = Number.isInteger(latestVariant) ? (latestVariant + 1) % coverVariantCount : undefined;
await writeFile(join(coversPath, coverFilename), coverSvg(article.title, article.slug, nextVariant), "utf8");
await writeFile(articlesPath, articleSource.replace(marker, `${marker}\n${entry}`), "utf8");
console.log(`Published ${article.slug} for ${publishDate}.`);
