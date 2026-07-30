import { articles, type Article } from "@/content/articles";
import alexAvatar from "@/assets/alex-macgregor.png.asset.json";

/* ------------------------------------------------------------------ *
 * Derivation layer.
 * Articles are authored with { slug, title, excerpt, readTime, date, body }.
 * Everything richer (category, tags, author, cover, reading time, related,
 * pillar) is derived automatically here, so newly published posts light up
 * across the blog with zero manual configuration.
 * ------------------------------------------------------------------ */

export const CATEGORIES = [
  "Branding",
  "Logo Design",
  "Icons",
  "Brand Kits",
  "Typography",
  "Colour Theory",
  "Startup Branding",
  "Product Design",
  "Case Studies",
  "Founder Stories",
  "Tutorials",
  "Rocket Updates",
] as const;

export type Category = (typeof CATEGORIES)[number];

const CATEGORY_RULES: { category: Category; keywords: string[]; weight?: number }[] = [
  { category: "Rocket Updates", keywords: ["changelog", "we shipped", "new in rocket", "release notes"], weight: 4 },
  { category: "Case Studies", keywords: ["case study", "teardown", "we analysed", "we analyzed", "before and after"], weight: 3 },
  { category: "Founder Stories", keywords: ["founder", "indie hacker", "solo founder", "my story", "bootstrapped"] },
  { category: "Logo Design", keywords: ["logo", "logotype", "wordmark", "brandmark", "lockup", "monogram"], weight: 2 },
  { category: "Icons", keywords: ["icon", "app icon", "glyph", "favicon", "symbol"], weight: 2 },
  { category: "Brand Kits", keywords: ["brand kit", "brand book", "brand guidelines", "style guide", "asset pack"], weight: 2 },
  { category: "Typography", keywords: ["typography", "typeface", "font", "kerning", "serif", "sans-serif"], weight: 2 },
  { category: "Colour Theory", keywords: ["colour", "color", "palette", "hue", "contrast ratio", "hex"], weight: 2 },
  { category: "Startup Branding", keywords: ["launch", "product hunt", "positioning", "naming", "tagline", "go-to-market", "directories"] },
  { category: "Product Design", keywords: ["landing page", "ui", "ux", "interface", "onboarding", "conversion"] },
  { category: "Tutorials", keywords: ["how to", "step by step", "checklist", "template", "framework", "walkthrough"] },
  { category: "Branding", keywords: ["brand", "identity", "positioning", "messaging", "voice"] },
];

const TAG_DICTIONARY = [
  "logo", "logotype", "wordmark", "icon", "brand kit", "typography", "colour palette",
  "positioning", "naming", "tagline", "launch", "product hunt", "seo", "landing page",
  "cold email", "pitch", "distribution", "founders", "copywriting", "identity",
  "case study", "checklist", "growth", "social media", "brand book",
];

const AUTHORS = {
  alex: {
    id: "alex",
    name: "Alex MacGregor",
    role: "Founder, Rocket",
    avatar: alexAvatar.url,
    bio: "Founder of Rocket. Previously built and branded a handful of products the hard way — hand-drawn logos, mismatched fonts, brand kits that never shipped. Now writing about how founders can build brands people remember.",
    socials: [
      { label: "X", href: "https://x.com/tryrocketai" },
      { label: "Instagram", href: "https://www.instagram.com/tryrocketai/" },
      { label: "Discord", href: "https://discord.gg/aSkXPHhTjJ" },
    ],
  },
} as const;

export type Author = (typeof AUTHORS)[keyof typeof AUTHORS];

export const getAuthor = (id?: string): Author => AUTHORS[(id as keyof typeof AUTHORS) || "alex"] || AUTHORS.alex;
export const allAuthors = (): Author[] => Object.values(AUTHORS);

/* ---------------------------------- helpers --------------------------------- */

const hash = (value: string) => {
  let h = 0;
  for (let i = 0; i < value.length; i += 1) h = (h * 31 + value.charCodeAt(i)) | 0;
  return Math.abs(h);
};

export const stripMarkdown = (body: string) =>
  body
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_`~|-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export const wordCount = (body: string) => stripMarkdown(body).split(" ").filter(Boolean).length;

export const readingTime = (article: Article) => {
  const words = wordCount(article.body);
  if (!words) return article.readTime || "5 min";
  return `${Math.max(1, Math.round(words / 220))} min`;
};

export const deriveCategory = (article: Article): Category => {
  if (article.category && (CATEGORIES as readonly string[]).includes(article.category)) {
    return article.category as Category;
  }
  const headline = `${article.title} ${article.excerpt}`.toLowerCase();
  const full = `${headline} ${article.body.slice(0, 4000)}`.toLowerCase();

  let best: { category: Category; score: number } = { category: "Branding", score: 0 };
  for (const rule of CATEGORY_RULES) {
    let score = 0;
    for (const keyword of rule.keywords) {
      if (headline.includes(keyword)) score += 6 * (rule.weight || 1);
      const matches = full.split(keyword).length - 1;
      score += Math.min(matches, 6) * (rule.weight || 1);
    }
    if (score > best.score) best = { category: rule.category, score };
  }
  return best.category;
};

export const deriveTags = (article: Article): string[] => {
  if (article.tags?.length) return article.tags;
  const text = `${article.title} ${article.excerpt} ${article.body.slice(0, 6000)}`.toLowerCase();
  const scored = TAG_DICTIONARY.map((tag) => ({ tag, score: text.split(tag).length - 1 }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map((entry) => entry.tag);
  return scored.length ? scored : ["branding"];
};

/* Deterministic duotone cover, derived from the slug — no asset pipeline,
   no manual upload, instant paint, zero layout shift. */
const COVER_PALETTES = [
  ["#1676e3", "#0b3f80"],
  ["#0f172a", "#1676e3"],
  ["#f97316", "#7c2d12"],
  ["#0d9488", "#083344"],
  ["#6366f1", "#1e1b4b"],
  ["#e11d48", "#4c0519"],
  ["#111827", "#374151"],
  ["#f59e0b", "#78350f"],
];

export const coverFor = (article: Article) => {
  const seed = hash(article.slug);
  const [from, to] = COVER_PALETTES[seed % COVER_PALETTES.length];
  return {
    image: article.cover || null,
    from,
    to,
    angle: 120 + (seed % 5) * 24,
    seed,
  };
};

/* ----------------------------- enriched articles ---------------------------- */

export type BlogPost = Omit<Article, "author" | "cover"> & {
  category: Category;
  tags: string[];
  author: Author;
  minutes: string;
  words: number;
  cover: ReturnType<typeof coverFor>;
};

const enrich = (article: Article): BlogPost => ({
  ...article,
  category: deriveCategory(article),
  tags: deriveTags(article),
  author: getAuthor(article.author),
  minutes: readingTime(article),
  words: wordCount(article.body),
  cover: coverFor(article),
});

/** Every published article, newest first. Future posts appear automatically. */
export const posts: BlogPost[] = [...articles]
  .map(enrich)
  .sort((a, b) => +new Date(b.date) - +new Date(a.date));

export const getPost = (slug: string) => posts.find((post) => post.slug === slug) || null;

export const activeCategories = (): Category[] =>
  CATEGORIES.filter((category) => posts.some((post) => post.category === category));

export const postsByCategory = (category: Category) => posts.filter((post) => post.category === category);

export const postsByAuthor = (authorId: string) => posts.filter((post) => post.author.id === authorId);

export const relatedPosts = (post: BlogPost, limit = 3) =>
  posts
    .filter((candidate) => candidate.slug !== post.slug)
    .map((candidate) => {
      let score = candidate.category === post.category ? 5 : 0;
      for (const tag of candidate.tags) if (post.tags.includes(tag)) score += 2;
      const days = Math.abs(+new Date(candidate.date) - +new Date(post.date)) / 86_400_000;
      return { candidate, score: score + Math.max(0, 1 - days / 365) };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.candidate);

export const adjacentPosts = (post: BlogPost) => {
  const index = posts.findIndex((candidate) => candidate.slug === post.slug);
  return {
    newer: index > 0 ? posts[index - 1] : null,
    older: index >= 0 && index < posts.length - 1 ? posts[index + 1] : null,
  };
};

/* -------------------------------- pillar hubs ------------------------------- */

export type Pillar = {
  slug: string;
  title: string;
  kicker: string;
  summary: string;
  categories: Category[];
  sections: { heading: string; body: string }[];
};

export const PILLARS: Pillar[] = [
  {
    slug: "startup-branding-guide",
    title: "The Startup Branding Guide",
    kicker: "Pillar guide",
    summary:
      "Everything a founder needs to turn a product into a brand: positioning, naming, taglines, launch assets, and the surfaces that quietly make or break perception.",
    categories: ["Startup Branding", "Branding", "Founder Stories"],
    sections: [
      {
        heading: "Start with the category you want to own",
        body: "Before a logo exists, decide the shelf you live on. A brand is a shortcut in someone's head — category, promise, vibe. Get those three sentences right and every design decision after gets easier.",
      },
      {
        heading: "Name and tagline before pixels",
        body: "The name sets the tone, the tagline sets the promise. Both are cheaper to change now than after you've printed stickers, bought a domain, and rendered a hundred social assets.",
      },
      {
        heading: "Ship a kit, not a logo",
        body: "Launch day needs more than one PNG: logo variants, an app icon, social profile icons, a palette, a type scale, and a short brand book so anyone can use it correctly.",
      },
    ],
  },
  {
    slug: "logo-design-guide",
    title: "The Logo Design Guide",
    kicker: "Pillar guide",
    summary:
      "How founders should think about marks, wordmarks, lockups, and variants — plus how to know when a logo is actually finished.",
    categories: ["Logo Design", "Icons"],
    sections: [
      {
        heading: "Mark, wordmark, lockup",
        body: "Most brands need all three. The mark works at 16px, the wordmark carries the name, and the lockup is what goes on your homepage. Design them together so they share proportions and optical weight.",
      },
      {
        heading: "Variants are the real deliverable",
        body: "Regular, inverse, white, and black. A logo that only works on white will break the first time it lands on a dark hero, a photo, or a partner's deck.",
      },
      {
        heading: "Test at the smallest size first",
        body: "If it survives a browser favicon and a mobile app icon, it will survive a billboard. The opposite is almost never true.",
      },
    ],
  },
  {
    slug: "brand-kit-guide",
    title: "The Brand Kit Guide",
    kicker: "Pillar guide",
    summary:
      "What belongs in a modern brand kit, which file formats matter, and how to keep every asset consistent as your product grows.",
    categories: ["Brand Kits", "Product Design", "Case Studies"],
    sections: [
      {
        heading: "The minimum viable kit",
        body: "Logo files in PNG and SVG, an app icon, social profile icons, a colour palette with hex values, two typefaces with a scale, and a one-page brand book. That's it — anything more is optimisation.",
      },
      {
        heading: "Formats founders actually need",
        body: "SVG for the web, PNG with transparency for decks and docs, PDF and EPS for print and agencies. Export once, store them together, hand over a single zip.",
      },
      {
        heading: "Consistency is a system, not discipline",
        body: "If applying the brand correctly requires remembering rules, it won't happen. Give every asset one source of truth and generate the rest from it.",
      },
    ],
  },
  {
    slug: "typography-guide",
    title: "The Typography Guide",
    kicker: "Pillar guide",
    summary:
      "Choosing, pairing, and scaling type so your brand reads as deliberate instead of default.",
    categories: ["Typography"],
    sections: [
      {
        heading: "Two typefaces is plenty",
        body: "One for headlines with personality, one for body text with stamina. A third is usually a decision you haven't made yet.",
      },
      {
        heading: "Scale beats choice",
        body: "A mediocre typeface on a disciplined scale looks better than a beautiful typeface used at eleven random sizes.",
      },
      {
        heading: "Letterspacing is the tell",
        body: "Tighten large headlines, loosen small uppercase labels. It's the fastest way to make a wordmark look professionally set.",
      },
    ],
  },
  {
    slug: "colour-psychology-guide",
    title: "Colour Psychology for Founders",
    kicker: "Pillar guide",
    summary:
      "How to pick a palette that carries meaning, passes contrast checks, and still looks like you in dark mode.",
    categories: ["Colour Theory"],
    sections: [
      {
        heading: "One colour does the work",
        body: "Brands are remembered by a single hue, not a palette. Choose the one, then build neutrals and support tones around it.",
      },
      {
        heading: "Contrast is a brand decision",
        body: "Accessibility isn't a compliance chore — unreadable text is a broken brand. Check every pairing at 4.5:1 before you fall in love.",
      },
      {
        heading: "Design for both modes",
        body: "Pick the colour that survives on white and on near-black. If it doesn't, define a second brand tone for dark surfaces up front.",
      },
    ],
  },
  {
    slug: "icon-design-guide",
    title: "The Icon Design Guide",
    kicker: "Pillar guide",
    summary:
      "App icons, favicons, and social profile marks — the small surfaces that carry the most brand recognition.",
    categories: ["Icons", "Product Design"],
    sections: [
      {
        heading: "The icon is not a shrunken logo",
        body: "Strip the wordmark, simplify the shape, and increase weight. What reads at 400px disappears at 32px.",
      },
      {
        heading: "One shape, one idea",
        body: "The strongest app icons contain a single memorable form. If you need to explain it, it's too clever.",
      },
      {
        heading: "Export every size",
        body: "Favicon, iOS, Android, X, LinkedIn, Instagram, Discord, Slack. Each platform crops differently — check the safe area before you ship.",
      },
    ],
  },
];

export const getPillar = (slug: string) => PILLARS.find((pillar) => pillar.slug === slug) || null;

export const pillarForPost = (post: BlogPost) =>
  PILLARS.find((pillar) => pillar.categories.includes(post.category)) || PILLARS[0];

export const pillarPosts = (pillar: Pillar) =>
  posts.filter((post) => pillar.categories.includes(post.category));

/* --------------------------------- searching -------------------------------- */

export const searchPosts = (query: string, source: BlogPost[] = posts) => {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return source;
  return source
    .map((post) => {
      const title = post.title.toLowerCase();
      const excerpt = post.excerpt.toLowerCase();
      const category = post.category.toLowerCase();
      const tags = post.tags.join(" ").toLowerCase();
      let score = 0;
      for (const term of terms) {
        if (title.includes(term)) score += 10;
        if (excerpt.includes(term)) score += 5;
        if (category.includes(term)) score += 4;
        if (tags.includes(term)) score += 3;
      }
      return { post, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.post);
};

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

export const SITE_URL = "https://tryrocket.ai";