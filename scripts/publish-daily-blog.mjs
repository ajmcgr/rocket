import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const articlesPath = join(process.cwd(), "src/content/articles.ts");
const coversPath = join(process.cwd(), "public/blog-covers");
const apiKey = process.env.GEMINI_API_KEY;
const model = process.env.GEMINI_BLOG_MODEL || "gemini-2.5-flash";

const categories = new Set([
  "Branding", "Logo Design", "Icons", "Brand Kits", "Typography", "Colour Theory",
  "Startup Branding", "Product Design", "Case Studies", "Founder Stories", "Tutorials", "Rocket Updates",
]);

const topics = [
  { title: "How to Turn a Startup Positioning Statement Into a Visual Brief", keywords: ["positioning statement", "visual brief"] },
  { title: "A Founder’s Checklist for Choosing a Startup Logo Direction", keywords: ["choosing a startup logo", "logo direction"] },
  { title: "How to Build a Brand Kit That a Small Team Will Actually Use", keywords: ["small team", "actually use"] },
  { title: "What a Startup Should Put in Its First Social Media Brand Kit", keywords: ["social media brand kit", "first social"] },
  { title: "When a Startup Needs a Wordmark, an Icon, or Both", keywords: ["wordmark, an icon", "wordmark, icon"] },
  { title: "How to Keep Launch Graphics Consistent When the Product Changes Fast", keywords: ["launch graphics consistent", "product changes fast"] },
  { title: "A Practical Brand Handoff Checklist for Startup Freelancers", keywords: ["brand handoff checklist", "startup freelancers"] },
  { title: "How to Choose Colours for a B2B Startup Without Looking Generic", keywords: ["colours for a b2b", "colors for a b2b"] },
  { title: "The Minimum Viable Brand System for a New SaaS Product", keywords: ["minimum viable brand system", "new saas product"] },
  { title: "How to Prepare a Startup Logo for Product Hunt and Launch Directories", keywords: ["launch directories", "logo for product hunt"] },
  { title: "How to Make a Startup Brand Look Consistent Across Product and Marketing", keywords: ["product and marketing", "brand look consistent"] },
  { title: "A Simple Process for Naming and Designing a New Startup", keywords: ["naming and designing", "designing a new startup"] },
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

const xml = (value) => value.replace(/[&<>'"]/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&apos;", "\"": "&quot;",
}[char]));

const coverSvg = (title) => `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900" role="img" aria-labelledby="title desc">
  <title id="title">${xml(title)}</title>
  <desc id="desc">A Rocket editorial illustration of a clear startup brand system.</desc>
  <rect width="1600" height="900" fill="#F5F5F3"/>
  <rect x="382" y="175" width="836" height="550" rx="42" fill="#FFFFFF" stroke="#0A0A0A" stroke-width="10"/>
  <rect x="461" y="256" width="678" height="352" rx="24" fill="#1676E3"/>
  <rect x="461" y="256" width="678" height="47" rx="24" fill="#0A0A0A"/>
  <circle cx="501" cy="280" r="8" fill="#F2683C"/>
  <circle cx="527" cy="280" r="8" fill="#E1E1DE"/>
  <circle cx="553" cy="280" r="8" fill="#FFFFFF"/>
  <rect x="496" y="334" width="170" height="239" rx="16" fill="#FFFFFF"/>
  <circle cx="581" cy="421" r="49" fill="#F2683C"/>
  <path d="M550 448l31-69 31 69h-21l-10-25-10 25z" fill="#0A0A0A"/>
  <rect x="527" y="499" width="108" height="14" rx="7" fill="#0A0A0A"/>
  <rect x="703" y="334" width="400" height="110" rx="16" fill="#0A0A0A"/>
  <rect x="738" y="368" width="170" height="18" rx="9" fill="#F5F5F3"/>
  <rect x="738" y="403" width="259" height="12" rx="6" fill="#B8B8B5"/>
  <rect x="703" y="466" width="190" height="107" rx="16" fill="#F2683C"/>
  <rect x="913" y="466" width="190" height="107" rx="16" fill="#E1E1DE"/>
  <path d="M750 542l48-63 48 63z" fill="#FFFFFF"/>
  <circle cx="1008" cy="519" r="31" fill="#1676E3"/>
  <rect x="541" y="650" width="518" height="17" rx="8.5" fill="#0A0A0A"/>
  <circle cx="354" cy="206" r="24" fill="#F2683C"/>
  <circle cx="1242" cy="700" r="30" fill="#1676E3"/>
  <path d="M1211 165h65v65" fill="none" stroke="#0A0A0A" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
`;

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
  const category = categories.has(value.category) ? value.category : "Startup Branding";
  const tags = Array.isArray(value.tags)
    ? [...new Set(value.tags.map((tag) => cleanText(tag, "tag", 48).toLowerCase()))].slice(0, 4)
    : ["startup branding", "founders"];
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

const prompt = `Write one original Rocket blog post for startup founders. Return JSON only, matching this exact shape:
{"title":"...","slug":"lowercase-hyphenated","excerpt":"...","category":"one allowed category","tags":["tag","tag"],"body":"Markdown article"}

Topic: ${topic.title}
Publication date: ${publishDate}
Allowed categories: ${[...categories].join(", ")}.

The article must be 650–1,500 words, useful and specific, and written in a clear editorial voice. Keep the excerpt to one sentence of 220 characters or fewer. Rocket is a product that helps founders create logos, icons, and Brand Kits. Mention it only where it is naturally relevant and never claim features, customers, outcomes, integrations, pricing, or statistics that are not supplied here. Do not use invented quotes, citations, case studies, or unverifiable facts. Do not use a title heading in the body. Include 3–5 practical sections with Markdown ## headings and one short useful list. Avoid generic AI-content filler, repeated points, and competitor comparisons.`;

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
await writeFile(join(coversPath, coverFilename), coverSvg(article.title), "utf8");
await writeFile(articlesPath, articleSource.replace(marker, `${marker}\n${entry}`), "utf8");
console.log(`Published ${article.slug} for ${publishDate}.`);
