import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, BookOpen, Search } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Link } from "@/lib/router-compat";
import SiteHeader from "@/components/SiteHeader";
import {
  docArticles,
  docGroups,
  searchDocs,
  type DocArticle,
} from "@/content/rocketDocs";
import "./Docs.css";

function DocLink({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return href.startsWith("/") ? (
    <Link to={href} className={className}>
      {children}
    </Link>
  ) : (
    <a href={href} className={className} rel="noreferrer" target="_blank">
      {children}
    </a>
  );
}

function GuideNavigation({ active }: { active?: string }) {
  return (
    <div className="space-y-6">
      <Link
        to="/docs"
        aria-current={active ? undefined : "page"}
        className="inline-flex min-h-10 items-center gap-2 font-semibold text-foreground"
      >
        <BookOpen className="h-4 w-4" aria-hidden="true" />
        Docs overview
      </Link>
      {docGroups.map((group) => (
        <div key={group}>
          <h2 className="mb-2 px-3 text-xs font-semibold text-muted-foreground">
            {group}
          </h2>
          <ul className="space-y-1">
            {docArticles
              .filter((article) => article.group === group)
              .map((article) => (
                <li key={article.slug}>
                  <Link
                    to={`/docs/${article.slug}`}
                    aria-current={active === article.slug ? "page" : undefined}
                    className={`block rounded-lg px-3 py-2 text-sm leading-5 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${active === article.slug ? "bg-brand/10 font-medium text-brand" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                  >
                    {article.title}
                  </Link>
                </li>
              ))}
          </ul>
        </div>
      ))}
      <Link
        to="/contact"
        className="inline-flex min-h-10 items-center text-sm text-brand hover:underline"
      >
        Contact Rocket →
      </Link>
    </div>
  );
}

export default function Docs({ article }: { article?: DocArticle }) {
  const [query, setQuery] = useState("");
  const results = searchDocs(query);
  const searching = Boolean(query.trim());
  useEffect(() => setQuery(""), [article?.slug]);
  const index = article
    ? docArticles.findIndex((doc) => doc.slug === article.slug)
    : -1;
  const previous = index > 0 ? docArticles[index - 1] : undefined;
  const next = index >= 0 ? docArticles[index + 1] : undefined;

  return (
    <div className="rocket-docs min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto max-w-[1440px] px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-5 border-b border-border pb-6">
          <nav
            aria-label="Breadcrumb"
            className="flex items-center gap-2 text-sm text-muted-foreground"
          >
            <Link to="/docs" className="font-medium text-foreground">
              Docs
            </Link>
            {article && (
              <>
                <span aria-hidden="true">/</span>
                <span>{article.group}</span>
              </>
            )}
          </nav>
          <div className="relative w-full sm:max-w-sm">
            <Search
              className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              type="search"
              aria-label="Search Rocket Docs"
              placeholder="Search guides…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="min-h-11 w-full rounded-xl border border-border bg-card py-2 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            />
          </div>
        </div>
        <details className="mb-7 rounded-xl border border-border bg-card p-4 lg:hidden">
          <summary className="cursor-pointer py-1 text-sm font-medium">
            Browse documentation
          </summary>
          <nav aria-label="Mobile documentation" className="mt-5">
            <GuideNavigation active={article?.slug} />
          </nav>
        </details>
        <div
          className={`grid min-w-0 gap-10 lg:grid-cols-[200px_minmax(0,1fr)] ${article && !searching ? "2xl:grid-cols-[220px_minmax(0,1fr)_170px]" : ""}`}
        >
          <aside className="hidden lg:block">
            <nav
              aria-label="Documentation"
              className="sticky top-24 max-h-[calc(100dvh-7rem)] overflow-y-auto overscroll-contain pr-3 pb-6"
            >
              <GuideNavigation active={article?.slug} />
            </nav>
          </aside>
          <div className="min-w-0">
            {searching ? (
              <section aria-labelledby="docs-search-title">
                <h1
                  id="docs-search-title"
                  className="text-3xl font-semibold tracking-tight"
                >
                  Search results
                </h1>
                <p role="status" className="mt-3 text-sm text-muted-foreground">
                  {results.length} {results.length === 1 ? "guide" : "guides"}{" "}
                  for “{query.trim()}”
                </p>
                {results.length ? (
                  <ul className="mt-7 space-y-3">
                    {results.map((result) => (
                      <li key={result.slug}>
                        <Link
                          to={`/docs/${result.slug}`}
                          onClick={() => setQuery("")}
                          className="block rounded-2xl border border-border bg-card p-5 transition hover:border-brand/40 hover:bg-muted/50"
                        >
                          <span className="text-xs text-muted-foreground">
                            {result.group}
                          </span>
                          <h2 className="mt-1 font-semibold">{result.title}</h2>
                          <p className="mt-2 text-sm leading-6 text-muted-foreground">
                            {result.summary}
                          </p>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="mt-7 rounded-2xl border border-border bg-card p-6">
                    <p className="leading-7 text-muted-foreground">
                      Try a provider name or a task such as “claim”, “Stripe” or
                      “sharing”.
                    </p>
                    <button
                      type="button"
                      onClick={() => setQuery("")}
                      className="mt-4 min-h-11 text-sm font-medium text-brand"
                    >
                      Browse all guides
                    </button>
                  </div>
                )}
              </section>
            ) : article ? (
              <>
                <article>
                  <header className="mb-10">
                    <p className="text-sm font-medium text-brand">
                      {article.group}
                    </p>
                    <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
                      {article.title}
                    </h1>
                    <p className="mt-4 max-w-3xl text-lg leading-8 text-muted-foreground">
                      {article.summary}
                    </p>
                  </header>
                  {article.sections.map((section) => (
                    <section
                      key={section.id}
                      id={section.id}
                      className="mb-10 scroll-mt-28"
                    >
                      <h2 className="mb-4 text-xl font-semibold tracking-tight sm:text-2xl">
                        <a href={`#${section.id}`} className="hover:text-brand">
                          {section.title}
                        </a>
                      </h2>
                      <div className="prose prose-neutral max-w-none break-words text-foreground prose-headings:text-foreground prose-p:leading-8 prose-a:font-medium prose-a:text-brand prose-a:underline-offset-4 prose-strong:text-foreground prose-li:leading-7 prose-th:text-foreground prose-td:text-muted-foreground dark:prose-invert [&_table]:block [&_table]:overflow-x-auto">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            a: ({ href = "", children }) => (
                              <DocLink href={href}>{children}</DocLink>
                            ),
                          }}
                        >
                          {section.body}
                        </ReactMarkdown>
                      </div>
                    </section>
                  ))}
                </article>
                <nav
                  aria-label="Related guides"
                  className="mt-12 grid gap-4 border-t border-border pt-6 sm:grid-cols-2"
                >
                  {previous ? (
                    <Link
                      to={`/docs/${previous.slug}`}
                      className="rounded-xl border border-border bg-card p-4 hover:border-brand/40"
                    >
                      <span className="flex items-center gap-2 text-xs text-muted-foreground">
                        <ArrowLeft className="h-3 w-3" aria-hidden="true" />
                        Previous
                      </span>
                      <span className="mt-2 block text-sm font-medium">
                        {previous.title}
                      </span>
                    </Link>
                  ) : (
                    <span />
                  )}
                  {next && (
                    <Link
                      to={`/docs/${next.slug}`}
                      className="rounded-xl border border-border bg-card p-4 hover:border-brand/40"
                    >
                      <span className="flex items-center gap-2 text-xs text-muted-foreground">
                        Next
                        <ArrowRight className="h-3 w-3" aria-hidden="true" />
                      </span>
                      <span className="mt-2 block text-sm font-medium">
                        {next.title}
                      </span>
                    </Link>
                  )}
                </nav>
                <p className="mt-8 text-sm leading-6 text-muted-foreground">
                  Need help with your setup?{" "}
                  <Link
                    to="/contact"
                    className="font-medium text-brand underline underline-offset-4"
                  >
                    Contact Rocket
                  </Link>{" "}
                  with the relevant app URL and error. Keep credentials private.
                </p>
              </>
            ) : (
              <>
                <header className="mb-10">
                  <p className="text-sm font-medium text-brand">Rocket Docs</p>
                  <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
                    Make Rocket work for you.
                  </h1>
                  <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">
                    Practical guides to discovering apps, managing your own and
                    connecting the tools that help it grow.
                  </p>
                  <Link
                    to="/docs/getting-started"
                    className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand px-5 py-3 text-sm font-medium text-white hover:bg-brand-hover"
                  >
                    Start with the essentials
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </header>
                {docGroups.map((group) => (
                  <section key={group} className="mb-10" aria-label={group}>
                    <h2 className="mb-4 text-xl font-semibold tracking-tight">
                      {group}
                    </h2>
                    <div className="grid gap-4 xl:grid-cols-2">
                      {docArticles
                        .filter((doc) => doc.group === group)
                        .map((doc) => (
                          <Link
                            key={doc.slug}
                            to={`/docs/${doc.slug}`}
                            className="group rounded-2xl border border-border bg-card p-5 transition-colors hover:border-brand/40 hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                          >
                            <h3 className="flex items-start justify-between gap-3 font-semibold leading-6">
                              {doc.title}
                              <ArrowRight
                                className="mt-1 h-4 w-4 shrink-0 text-muted-foreground group-hover:text-brand"
                                aria-hidden="true"
                              />
                            </h3>
                            <p className="mt-2 text-sm leading-6 text-muted-foreground">
                              {doc.summary}
                            </p>
                          </Link>
                        ))}
                    </div>
                  </section>
                ))}
              </>
            )}
          </div>
          {article && !searching && (
            <aside className="hidden 2xl:block">
              <nav
                aria-label="On this page"
                className="sticky top-24 border-l border-border pl-5"
              >
                <p className="mb-3 text-xs font-semibold text-muted-foreground">
                  On this page
                </p>
                <ul className="space-y-3">
                  {article.sections.map((section) => (
                    <li key={section.id}>
                      <a
                        href={`#${section.id}`}
                        className="text-sm leading-6 text-muted-foreground hover:text-brand"
                      >
                        {section.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            </aside>
          )}
        </div>
      </main>
    </div>
  );
}
