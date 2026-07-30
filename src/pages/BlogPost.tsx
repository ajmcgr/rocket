import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowLeft, ArrowRight, Check, Link2, Linkedin } from "lucide-react";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import ArticleCard from "@/components/blog/ArticleCard";
import ArticleCover from "@/components/blog/ArticleCover";
import InlineCta from "@/components/blog/InlineCta";
import NewsletterCta from "@/components/blog/NewsletterCta";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useDocumentMeta } from "@/hooks/useDocumentMeta";
import {
  adjacentPosts,
  formatDate,
  getPost,
  pillarForPost,
  relatedPosts,
  SITE_URL,
  stripMarkdown,
} from "@/content/blogMeta";

const slugify = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

const textOf = (node: React.ReactNode): string => {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (node && typeof node === "object" && "props" in (node as never)) {
    return textOf((node as { props: { children?: React.ReactNode } }).props.children);
  }
  return "";
};

const markdownComponents = {
  h2: ({ children }: { children?: React.ReactNode }) => (
    <h2 id={slugify(textOf(children))} className="scroll-mt-28">{children}</h2>
  ),
  h3: ({ children }: { children?: React.ReactNode }) => (
    <h3 id={slugify(textOf(children))} className="scroll-mt-28">{children}</h3>
  ),
  img: ({ src, alt }: { src?: string; alt?: string }) => (
    <figure className="not-prose my-8">
      <img
        src={src}
        alt={alt || ""}
        loading="lazy"
        decoding="async"
        className="w-full rounded-2xl border border-neutral-200 bg-neutral-50"
      />
      {alt ? <figcaption className="mt-3 text-center text-xs text-neutral-500">{alt}</figcaption> : null}
    </figure>
  ),
  a: ({ href, children }: { href?: string; children?: React.ReactNode }) => {
    const internal = href?.startsWith("/");
    if (internal) return <Link to={href!}>{children}</Link>;
    return (
      <a href={href} target="_blank" rel="noreferrer noopener">
        {children}
      </a>
    );
  },
};

const XIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
    <path d="M18.244 2H21.5l-7.5 8.57L23 22h-6.797l-5.32-6.96L4.8 22H1.54l8.02-9.17L1 2h6.93l4.81 6.36L18.244 2Zm-1.19 18h1.88L7.04 4H5.06l11.994 16Z" />
  </svg>
);

const BlogPost = () => {
  const { slug } = useParams();
  const post = slug ? getPost(slug) : null;
  const { toast } = useToast();
  const [progress, setProgress] = useState(0);
  const [activeId, setActiveId] = useState("");
  const [copied, setCopied] = useState(false);

  const url = `${SITE_URL}/blog/${slug}`;

  useDocumentMeta({
    title: post ? `${post.title} — Rocket Blog` : "Article not found — Rocket Blog",
    description: post?.excerpt,
  });

  useEffect(() => {
    const onScroll = () => {
      const el = document.getElementById("article-body");
      if (!el) return;
      const start = el.offsetTop;
      const total = el.offsetHeight - window.innerHeight * 0.4;
      const scrolled = window.scrollY - start;
      setProgress(Math.min(100, Math.max(0, (scrolled / Math.max(total, 1)) * 100)));

      const headings = Array.from(el.querySelectorAll<HTMLElement>("h2[id], h3[id]"));
      const current = headings.filter((heading) => heading.getBoundingClientRect().top < 140).pop();
      setActiveId(current?.id || headings[0]?.id || "");
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [slug]);

  const toc = useMemo(() => {
    if (!post) return [];
    return Array.from(post.body.matchAll(/^(##|###)\s+(.+)$/gm)).map((match) => ({
      level: match[1].length,
      text: match[2].replace(/[*_`]/g, "").trim(),
      id: slugify(match[2].replace(/[*_`]/g, "").trim()),
    }));
  }, [post]);

  const { intro, outro } = useMemo(() => {
    if (!post) return { intro: "", outro: "" };
    const body = post.body.replace(/^#\s+.+\n?/, "").trim();
    const sections = body.split(/\n(?=##\s)/);
    if (sections.length < 3) return { intro: body, outro: "" };
    const cut = Math.max(1, Math.ceil(sections.length * 0.45));
    return { intro: sections.slice(0, cut).join("\n"), outro: sections.slice(cut).join("\n") };
  }, [post]);

  if (!post) {
    return (
      <div className="min-h-screen bg-white text-neutral-900">
        <SiteHeader />
        <main className="mx-auto max-w-3xl px-6 py-24 text-center">
          <h1 className="text-3xl font-semibold">Article not found</h1>
          <Link to="/blog" className="mt-6 inline-block text-brand hover:underline">← Back to blog</Link>
        </main>
        <SiteFooter />
      </div>
    );
  }

  const related = relatedPosts(post, 3);
  const { newer, older } = adjacentPosts(post);
  const pillar = pillarForPost(post);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Couldn't copy the link", variant: "destructive" });
    }
  };

  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      headline: post.title,
      description: post.excerpt,
      datePublished: post.date,
      dateModified: post.date,
      articleSection: post.category,
      keywords: post.tags.join(", "),
      wordCount: post.words,
      mainEntityOfPage: { "@type": "WebPage", "@id": url },
      author: { "@type": "Person", name: post.author.name, url: `${SITE_URL}/blog/author/${post.author.id}` },
      publisher: { "@type": "Organization", name: "Rocket", url: SITE_URL },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
        { "@type": "ListItem", position: 2, name: "Blog", item: `${SITE_URL}/blog` },
        { "@type": "ListItem", position: 3, name: post.title, item: url },
      ],
    },
    ...(post.faq?.length
      ? [
          {
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: post.faq.map((item) => ({
              "@type": "Question",
              name: item.question,
              acceptedAnswer: { "@type": "Answer", text: item.answer },
            })),
          },
        ]
      : []),
  ];

  return (
    <div className="min-h-screen bg-white text-neutral-900">
      <SiteHeader />
      <div className="sticky top-0 z-40 h-0.5 w-full bg-transparent">
        <div className="h-full bg-brand transition-[width] duration-150" style={{ width: `${progress}%` }} />
      </div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <main className="mx-auto max-w-6xl px-6 pb-24 pt-10">
        <nav aria-label="Breadcrumb" className="text-xs text-neutral-500">
          <ol className="flex flex-wrap items-center gap-2">
            <li><Link to="/" className="hover:text-neutral-900">Home</Link></li>
            <li aria-hidden>/</li>
            <li><Link to="/blog" className="hover:text-neutral-900">Blog</Link></li>
            <li aria-hidden>/</li>
            <li className="text-neutral-800">{post.category}</li>
          </ol>
        </nav>

        <header className="mt-8 max-w-3xl">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-neutral-500">
            <span className="rounded-full border border-neutral-200 px-3 py-1 font-semibold text-brand">{post.category}</span>
            <span className="ml-1">{formatDate(post.date)}</span>
            <span aria-hidden>·</span>
            <span>{post.minutes} read</span>
          </div>
          <h1
            className="mt-6 text-4xl font-medium leading-[1.08] tracking-tight text-neutral-900 sm:text-5xl"
            style={{ fontFamily: "Reckless, ui-serif, Georgia, serif" }}
          >
            {post.title}
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-neutral-600">{post.excerpt}</p>

          <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-y border-neutral-200 py-4">
            <Link to={`/blog/author/${post.author.id}`} className="group flex items-center gap-3">
              <img
                src={post.author.avatar}
                alt={post.author.name}
                loading="lazy"
                className="h-10 w-10 rounded-full object-cover"
              />
              <span className="text-sm">
                <span className="block font-medium text-neutral-900 group-hover:text-brand">{post.author.name}</span>
                <span className="block text-xs text-neutral-500">{post.author.role}</span>
              </span>
            </Link>
            <div className="flex items-center gap-2">
              <a
                href={`https://x.com/intent/tweet?text=${encodeURIComponent(post.title)}&url=${encodeURIComponent(url)}`}
                target="_blank"
                rel="noreferrer"
                aria-label="Share on X"
                className="grid h-9 w-9 place-items-center rounded-full border border-neutral-200 text-neutral-600 transition hover:border-neutral-900 hover:text-neutral-900"
              >
                <XIcon className="h-3.5 w-3.5" />
              </a>
              <a
                href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`}
                target="_blank"
                rel="noreferrer"
                aria-label="Share on LinkedIn"
                className="grid h-9 w-9 place-items-center rounded-full border border-neutral-200 text-neutral-600 transition hover:border-neutral-900 hover:text-neutral-900"
              >
                <Linkedin className="h-4 w-4" />
              </a>
              <button
                type="button"
                onClick={copyLink}
                aria-label="Copy link"
                className="grid h-9 w-9 place-items-center rounded-full border border-neutral-200 text-neutral-600 transition hover:border-neutral-900 hover:text-neutral-900"
              >
                {copied ? <Check className="h-4 w-4 text-brand" /> : <Link2 className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </header>

        <ArticleCover post={post} size="lg" priority className="mt-10 aspect-[21/9] w-full" />

        <div className="mt-14 grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,1fr)_260px]">
          <div id="article-body" className="min-w-0 max-w-3xl">
            <article className="prose prose-neutral max-w-none prose-headings:tracking-tight prose-headings:font-medium prose-h2:mt-14 prose-h2:text-3xl prose-h3:mt-10 prose-h3:text-xl prose-p:leading-[1.8] prose-p:text-neutral-700 prose-li:leading-[1.8] prose-a:text-brand prose-strong:text-neutral-900 prose-blockquote:border-brand prose-blockquote:not-italic prose-img:rounded-2xl">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                {intro}
              </ReactMarkdown>
              <InlineCta category={post.category} />
              {outro && (
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                  {outro}
                </ReactMarkdown>
              )}
            </article>

            {post.faq?.length ? (
              <section className="mt-14 border-t border-neutral-200 pt-10">
                <h2 className="text-2xl font-medium tracking-tight" style={{ fontFamily: "Reckless, ui-serif, Georgia, serif" }}>
                  Frequently asked
                </h2>
                <dl className="mt-6 space-y-6">
                  {post.faq.map((item) => (
                    <div key={item.question}>
                      <dt className="text-base font-semibold text-neutral-900">{item.question}</dt>
                      <dd className="mt-2 text-sm leading-relaxed text-neutral-600">{item.answer}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            ) : null}

            {/* Pillar link — strengthens internal linking automatically */}
            <Link
              to={`/resources/${pillar.slug}`}
              className="mt-14 flex items-center justify-between gap-4 rounded-2xl border border-neutral-200 p-6 transition hover:border-neutral-900"
            >
              <span>
                <span className="block text-xs font-semibold uppercase tracking-[0.16em] text-neutral-400">
                  Part of the guide
                </span>
                <span
                  className="mt-2 block text-lg font-medium tracking-tight text-neutral-900"
                  style={{ fontFamily: "Reckless, ui-serif, Georgia, serif" }}
                >
                  {pillar.title}
                </span>
              </span>
              <ArrowRight className="h-5 w-5 shrink-0 text-neutral-400" />
            </Link>

            {/* Author card */}
            <section className="mt-10 flex flex-col gap-5 rounded-2xl bg-neutral-50 p-6 sm:flex-row sm:items-center">
              <img src={post.author.avatar} alt={post.author.name} loading="lazy" className="h-16 w-16 rounded-full object-cover" />
              <div>
                <div className="text-sm font-semibold text-neutral-900">{post.author.name}</div>
                <p className="mt-1.5 text-sm leading-relaxed text-neutral-600">{post.author.bio}</p>
                <Link to={`/blog/author/${post.author.id}`} className="mt-2 inline-block text-sm font-medium text-brand hover:underline">
                  All articles by {post.author.name.split(" ")[0]} →
                </Link>
              </div>
            </section>

            {/* Prev / next */}
            <nav className="mt-12 grid grid-cols-1 gap-4 border-t border-neutral-200 pt-8 sm:grid-cols-2">
              {older ? (
                <Link to={`/blog/${older.slug}`} className="group rounded-xl border border-neutral-200 p-5 transition hover:border-neutral-900">
                  <span className="flex items-center gap-1.5 text-xs text-neutral-500"><ArrowLeft className="h-3 w-3" /> Previous</span>
                  <span className="mt-2 block text-sm font-medium text-neutral-900 group-hover:text-brand">{older.title}</span>
                </Link>
              ) : <span />}
              {newer ? (
                <Link to={`/blog/${newer.slug}`} className="group rounded-xl border border-neutral-200 p-5 text-right transition hover:border-neutral-900">
                  <span className="flex items-center justify-end gap-1.5 text-xs text-neutral-500">Next <ArrowRight className="h-3 w-3" /></span>
                  <span className="mt-2 block text-sm font-medium text-neutral-900 group-hover:text-brand">{newer.title}</span>
                </Link>
              ) : null}
            </nav>
          </div>

          {/* Sticky TOC */}
          {toc.length > 1 && (
            <aside className="hidden lg:block">
              <div className="sticky top-24">
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-400">On this page</div>
                <ul className="mt-4 space-y-2 border-l border-neutral-200">
                  {toc.map((item) => (
                    <li key={item.id} style={{ paddingLeft: item.level === 3 ? 24 : 14 }}>
                      <a
                        href={`#${item.id}`}
                        className={`-ml-px block border-l py-0.5 text-sm transition ${
                          activeId === item.id
                            ? "border-brand pl-3 font-medium text-neutral-900"
                            : "border-transparent pl-3 text-neutral-500 hover:text-neutral-900"
                        }`}
                      >
                        {item.text}
                      </a>
                    </li>
                  ))}
                </ul>
                <div className="mt-8 rounded-xl border border-neutral-200 p-4">
                  <p className="text-sm leading-relaxed text-neutral-600">
                    Generate a logo, icons, and a full brand kit in about a minute.
                  </p>
                  <Button asChild size="sm" className="mt-3 w-full">
                    <Link to="/signup">Try Rocket</Link>
                  </Button>
                </div>
              </div>
            </aside>
          )}
        </div>

        {/* Related */}
        {related.length > 0 && (
          <section className="mt-20 border-t border-neutral-200 pt-12">
            <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">You might also like</h2>
            <div className="mt-10 grid grid-cols-1 gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
              {related.map((item) => (
                <ArticleCard key={item.slug} post={item} compact />
              ))}
            </div>
          </section>
        )}

        <div className="mt-20">
          <NewsletterCta compact />
        </div>

        <p className="sr-only">{stripMarkdown(post.body).slice(0, 0)}</p>
      </main>
      <SiteFooter />
    </div>
  );
};

export default BlogPost;