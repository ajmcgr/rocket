import { Link, useParams } from "react-router-dom";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import ArticleCard from "@/components/blog/ArticleCard";
import NewsletterCta from "@/components/blog/NewsletterCta";
import { PILLARS, getPillar, pillarPosts, SITE_URL } from "@/content/blogMeta";
import { useDocumentMeta } from "@/hooks/useDocumentMeta";

export const ResourcesHub = () => {
  useDocumentMeta({
    title: "Branding Resources for Founders — Rocket",
    description:
      "Evergreen guides on startup branding, logo design, brand kits, typography, colour psychology, and icon design.",
    canonical: `${SITE_URL}/resources`,
  });

  return (
    <div className="min-h-screen bg-white text-neutral-900">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-6 pb-24 pt-14 sm:pt-20">
        <header className="max-w-3xl">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Resources</div>
          <h1
            className="mt-5 text-4xl font-medium leading-[1.05] tracking-tight sm:text-6xl"
            style={{ fontFamily: "Reckless, ui-serif, Georgia, serif" }}
          >
            Everything a founder needs to build a brand.
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-neutral-600">
            Long-form guides that stay useful. Each one links to the articles, checklists, and templates behind it.
          </p>
        </header>

        <div className="mt-14 grid grid-cols-1 gap-6 sm:grid-cols-2">
          {PILLARS.map((pillar) => (
            <Link
              key={pillar.slug}
              to={`/resources/${pillar.slug}`}
              className="group rounded-3xl border border-neutral-200 p-8 transition hover:border-neutral-900"
            >
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-400">{pillar.kicker}</div>
              <h2
                className="mt-4 text-2xl font-medium tracking-tight text-neutral-900 group-hover:text-brand"
                style={{ fontFamily: "Reckless, ui-serif, Georgia, serif" }}
              >
                {pillar.title}
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-neutral-600">{pillar.summary}</p>
              <div className="mt-5 text-xs text-neutral-500">{pillarPosts(pillar).length} related articles</div>
            </Link>
          ))}
        </div>

        <div className="mt-20">
          <NewsletterCta />
        </div>
      </main>
      <SiteFooter />
    </div>
  );
};

export const PillarPage = () => {
  const { slug } = useParams();
  const pillar = slug ? getPillar(slug) : null;

  useDocumentMeta({
    title: pillar ? `${pillar.title} — Rocket` : "Guide not found — Rocket",
    description: pillar?.summary,
    canonical: pillar ? `${SITE_URL}/resources/${pillar.slug}` : undefined,
  });

  if (!pillar) {
    return (
      <div className="min-h-screen bg-white text-neutral-900">
        <SiteHeader />
        <main className="mx-auto max-w-3xl px-6 py-24 text-center">
          <h1 className="text-3xl font-semibold">Guide not found</h1>
          <Link to="/resources" className="mt-6 inline-block text-brand hover:underline">← All resources</Link>
        </main>
        <SiteFooter />
      </div>
    );
  }

  const related = pillarPosts(pillar);

  return (
    <div className="min-h-screen bg-white text-neutral-900">
      <SiteHeader />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Article",
            headline: pillar.title,
            description: pillar.summary,
            mainEntityOfPage: `${SITE_URL}/resources/${pillar.slug}`,
            publisher: { "@type": "Organization", name: "Rocket", url: SITE_URL },
          }),
        }}
      />
      <main className="mx-auto max-w-4xl px-6 pb-24 pt-12">
        <nav aria-label="Breadcrumb" className="text-xs text-neutral-500">
          <ol className="flex items-center gap-2">
            <li><Link to="/" className="hover:text-neutral-900">Home</Link></li>
            <li aria-hidden>/</li>
            <li><Link to="/resources" className="hover:text-neutral-900">Resources</Link></li>
          </ol>
        </nav>
        <header className="mt-8">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-400">{pillar.kicker}</div>
          <h1
            className="mt-4 text-4xl font-medium leading-[1.08] tracking-tight sm:text-5xl"
            style={{ fontFamily: "Reckless, ui-serif, Georgia, serif" }}
          >
            {pillar.title}
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-neutral-600">{pillar.summary}</p>
        </header>

        <div className="mt-12 space-y-10">
          {pillar.sections.map((section) => (
            <section key={section.heading}>
              <h2 className="text-2xl font-medium tracking-tight" style={{ fontFamily: "Reckless, ui-serif, Georgia, serif" }}>
                {section.heading}
              </h2>
              <p className="mt-3 text-base leading-[1.8] text-neutral-700">{section.body}</p>
            </section>
          ))}
        </div>

        {related.length > 0 && (
          <section className="mt-16 border-t border-neutral-200 pt-12">
            <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">In this guide</h2>
            <div className="mt-10 grid grid-cols-1 gap-x-8 gap-y-12 sm:grid-cols-2">
              {related.map((post) => (
                <ArticleCard key={post.slug} post={post} compact />
              ))}
            </div>
          </section>
        )}

        <div className="mt-16">
          <NewsletterCta compact />
        </div>
      </main>
      <SiteFooter />
    </div>
  );
};

export default ResourcesHub;
