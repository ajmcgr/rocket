import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Search, X, ArrowRight } from "lucide-react";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import ArticleCard from "@/components/blog/ArticleCard";
import ArticleCover from "@/components/blog/ArticleCover";
import Highlight from "@/components/blog/Highlight";
import NewsletterCta from "@/components/blog/NewsletterCta";
import { Button } from "@/components/ui/button";
import { useDocumentMeta } from "@/hooks/useDocumentMeta";
import { useEnsureBlogImages } from "@/hooks/useBlogImages";
import {
  activeCategories,
  formatDate,
  posts,
  searchPosts,
  PILLARS,
  SITE_URL,
  type Category,
} from "@/content/blogMeta";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 9;

const Blog = () => {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<Category | "All">("All");
  const [visible, setVisible] = useState(PAGE_SIZE);

  useDocumentMeta({
    title: "Rocket Blog — Branding playbooks for founders",
    description:
      "Guides, teardowns, and playbooks on logos, icons, brand kits, typography, and colour — written for founders building brands people remember.",
    canonical: `${SITE_URL}/blog`,
  });

  const categories = useMemo(() => activeCategories(), []);

  // Generates missing Gemini artwork for the archive in the background.
  useEnsureBlogImages(posts);

  const filtered = useMemo(() => {
    const scoped = category === "All" ? posts : posts.filter((post) => post.category === category);
    return searchPosts(query, scoped);
  }, [query, category]);

  const searching = query.trim().length > 0;
  const [featured, ...rest] = filtered;
  const grid = searching || category !== "All" ? filtered : rest;
  const shown = grid.slice(0, visible);

  return (
    <div className="min-h-screen bg-white text-neutral-900">
      <SiteHeader />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Blog",
            name: "Rocket Blog",
            url: `${SITE_URL}/blog`,
            description: "Branding playbooks for founders.",
            blogPost: posts.slice(0, 20).map((post) => ({
              "@type": "BlogPosting",
              headline: post.title,
              datePublished: post.date,
              url: `${SITE_URL}/blog/${post.slug}`,
            })),
          }),
        }}
      />

      <main className="mx-auto max-w-6xl px-6 pb-24 pt-14 sm:pt-20">
        <header className="max-w-3xl">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">The Rocket Blog</div>
          <h1
            className="mt-5 text-4xl font-medium leading-[1.05] tracking-tight text-neutral-900 sm:text-6xl"
            style={{ fontFamily: "Reckless, ui-serif, Georgia, serif" }}
          >
            The branding resource for founders.
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-neutral-600">
            Practical guides on logos, icons, brand kits, typography, and colour — plus the launch playbooks
            we use ourselves. New article every day.
          </p>
        </header>

        {/* Search + categories */}
        <div className="mt-10 flex flex-col gap-4">
          <div className="relative max-w-md">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <input
              type="search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setVisible(PAGE_SIZE);
              }}
              placeholder="Search articles, categories, tags…"
              aria-label="Search articles"
              className="h-12 w-full rounded-full border border-neutral-200 bg-white pl-11 pr-10 text-sm text-neutral-900 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-neutral-400 hover:text-neutral-700"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="-mx-6 overflow-x-auto px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="flex w-max items-center gap-2 py-1">
              {(["All", ...categories] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => {
                    setCategory(item as Category | "All");
                    setVisible(PAGE_SIZE);
                  }}
                  className={cn(
                    "rounded-full border px-4 py-2 text-sm transition",
                    category === item
                      ? "border-neutral-900 bg-neutral-900 text-white"
                      : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-400 hover:text-neutral-900",
                  )}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Featured hero */}
        {!searching && category === "All" && featured && (
          <section className="mt-14 border-t border-neutral-200 pt-12">
            <Link to={`/blog/${featured.slug}`} className="group grid grid-cols-1 gap-10 lg:grid-cols-2 lg:items-center">
              <ArticleCover
                post={featured}
                size="lg"
                priority
                className="aspect-[16/10] w-full transition-shadow duration-300 group-hover:shadow-[0_30px_70px_-30px_rgba(15,23,42,0.5)]"
              />
              <div>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-neutral-500">
                  <span className="rounded-full border border-neutral-200 px-3 py-1 font-semibold text-brand">
                    {featured.category}
                  </span>
                  <span className="ml-1">{formatDate(featured.date)}</span>
                  <span aria-hidden>·</span>
                  <span>{featured.minutes} read</span>
                </div>
                <h2
                  className="mt-5 text-3xl font-medium leading-[1.1] tracking-tight text-neutral-900 transition-colors group-hover:text-brand sm:text-[2.6rem]"
                  style={{ fontFamily: "Reckless, ui-serif, Georgia, serif" }}
                >
                  {featured.title}
                </h2>
                <p className="mt-5 max-w-xl text-base leading-relaxed text-neutral-600">{featured.excerpt}</p>
                <span className="mt-7 inline-flex items-center gap-2 rounded-lg bg-brand px-5 py-3 text-sm font-semibold text-white transition group-hover:bg-brand-hover">
                  Read article <ArrowRight className="h-4 w-4" />
                </span>
              </div>
            </Link>
          </section>
        )}

        {/* Grid */}
        <section className="mt-16 border-t border-neutral-200 pt-12">
          <div className="flex items-baseline justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">
              {searching ? `${filtered.length} result${filtered.length === 1 ? "" : "s"}` : category === "All" ? "Latest articles" : category}
            </h2>
            <Link to="/resources" className="text-sm font-medium text-brand hover:underline">
              Browse guides →
            </Link>
          </div>

          {shown.length === 0 ? (
            <p className="mt-10 text-sm text-neutral-500">
              No articles matched “{query}”. Try a broader term like “logo”, “typography”, or “launch”.
            </p>
          ) : (
            <div className="mt-10 grid grid-cols-1 gap-x-8 gap-y-14 sm:grid-cols-2 lg:grid-cols-3">
              {shown.map((post) => (
                <ArticleCard key={post.slug} post={post} query={query} />
              ))}
            </div>
          )}

          {grid.length > shown.length && (
            <div className="mt-14 text-center">
              <Button variant="outline" size="lg" onClick={() => setVisible((value) => value + PAGE_SIZE)}>
                Load more articles
              </Button>
            </div>
          )}
        </section>

        {/* Pillar guides */}
        <section className="mt-20 border-t border-neutral-200 pt-12">
          <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Start here</h2>
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {PILLARS.map((pillar) => (
              <Link
                key={pillar.slug}
                to={`/resources/${pillar.slug}`}
                className="group rounded-2xl border border-neutral-200 p-6 transition hover:border-neutral-900"
              >
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-400">{pillar.kicker}</div>
                <div
                  className="mt-3 text-xl font-medium tracking-tight text-neutral-900"
                  style={{ fontFamily: "Reckless, ui-serif, Georgia, serif" }}
                >
                  {pillar.title}
                </div>
                <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-neutral-600">{pillar.summary}</p>
              </Link>
            ))}
          </div>
        </section>

        <div className="mt-20">
          <NewsletterCta />
        </div>
      </main>
      <SiteFooter />
    </div>
  );
};

export default Blog;
