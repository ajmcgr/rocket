import { Link, useParams } from "@/lib/router-compat";
import { ArrowRight } from "@/components/EmojiIcons";
import SiteHeader from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { comparisons, getComparison } from "@/content/comparisons";
import { getMarketplaceComparison, marketplaceComparisons } from "@/content/marketplaceComparisons";
import { useDocumentMeta } from "@/hooks/useDocumentMeta";

const ComparisonDetail = () => {
  const { slug } = useParams();
  const marketplace = slug ? getMarketplaceComparison(slug) : null;
  const comparison = slug ? getComparison(slug) : null;

  useDocumentMeta({
    title: marketplace ? `Rocket vs ${marketplace.name} — Compare software discovery` : comparison ? `Rocket vs ${comparison.tool} — AI logo and brand tools compared` : "Comparison not found — Rocket",
    description: marketplace ? `Compare Rocket and ${marketplace.name} for finding independent software.` : comparison ? `Compare Rocket with ${comparison.tool} for logos, icons, Brand Kits, editing and exports.` : undefined,
    canonical: marketplace ? `https://tryrocket.ai/compare/${marketplace.slug}` : comparison ? `https://tryrocket.ai/compare/${comparison.slug}` : undefined,
  });

  if (marketplace) return (
    <div className="marketplace-page min-h-screen bg-[#f7f9fc] text-neutral-950">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-5 py-12 sm:px-8 sm:py-20">
        <Link to="/compare" className="text-sm font-medium text-sky-800 hover:underline">← All comparisons</Link>
        <p className="mt-10 text-sm font-semibold text-sky-800">{marketplace.focus}</p>
        <h1 className="mt-2 text-4xl font-bold tracking-tight sm:text-6xl">Rocket vs {marketplace.name}</h1>
        <p className="mt-5 max-w-3xl text-lg leading-relaxed text-neutral-600">{marketplace.summary}</p>
        <div className="mt-10 grid gap-5 md:grid-cols-2">
          <section className="rounded-2xl border border-neutral-200 bg-white p-6 sm:p-8">
            <h2 className="text-xl font-semibold">Choose {marketplace.name} when…</h2>
            <p className="mt-3 leading-relaxed text-neutral-600">{marketplace.chooseThem}</p>
          </section>
          <section className="rounded-2xl border border-neutral-200 bg-white p-6 sm:p-8">
            <h2 className="text-xl font-semibold">Choose Rocket when…</h2>
            <p className="mt-3 leading-relaxed text-neutral-600">{marketplace.chooseRocket}</p>
          </section>
        </div>
        <section className="mt-10 border-t border-neutral-200 pt-8">
          <h2 className="text-2xl font-semibold">What Rocket offers today</h2>
          <p className="mt-3 max-w-3xl leading-relaxed text-neutral-600">Search and browse apps, explore categories, Launch-vote Rankings and New arrivals, save listings, and submit or claim an app. Listing does not mean endorsement. Rocket Login and Payments work only where a developer has integrated them.</p>
          <Link to="/discover" className="mt-6 inline-flex rounded-xl bg-[#167ac6] px-5 py-3 text-sm font-semibold text-white hover:bg-[#1268aa]">Explore apps <ArrowRight className="ml-2 h-4 w-4" /></Link>
        </section>
        <p className="mt-12 text-sm text-neutral-500">Competitor description source: <a href={marketplace.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline hover:text-neutral-900">{marketplace.sourceLabel}</a>. Product capabilities may change.</p>
        <nav aria-label="Other comparisons" className="mt-10 flex flex-wrap gap-4 text-sm">
          {marketplaceComparisons.filter((item) => item.slug !== marketplace.slug).map((item) => <Link key={item.slug} to={`/compare/${item.slug}`} className="font-medium text-sky-800 hover:underline">Rocket vs {item.name} →</Link>)}
        </nav>
      </main>

    </div>
  );

  if (!comparison) {
    return (
      <div className="min-h-screen bg-white text-neutral-900">
        <SiteHeader />
        <main className="mx-auto max-w-3xl px-6 py-24 text-center">
          <h1 className="text-3xl font-semibold">Comparison not found</h1>
          <Link to="/" className="mt-6 inline-block text-brand hover:underline">← Back home</Link>
        </main>

      </div>
    );
  }

  const others = comparisons.filter((item) => item.slug !== comparison.slug);

  return (
    <div className="min-h-screen bg-white text-neutral-900">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-6 py-16">
        <Link to="/" className="text-sm text-neutral-500 hover:text-neutral-900">← Back home</Link>
        <div className="mt-6 grid gap-12 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div>
            <div className="inline-flex items-center rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1 text-xs font-medium text-neutral-700">
              Compare
            </div>
            <h1 className="mt-5 text-4xl font-semibold tracking-tight sm:text-5xl">
              Rocket vs {comparison.tool}
            </h1>
            <p className="mt-4 text-lg text-neutral-600">
              A quick founder-focused comparison for choosing the right logo, icon, and brand kit tool.
            </p>

            <section className="mt-10 rounded-3xl border border-neutral-200 bg-white p-8">
              <div className="text-sm font-medium text-neutral-500">Ranked option #{comparison.rank}</div>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight">{comparison.tool}</h2>
              <p className="mt-4 text-base leading-8 text-neutral-700">{comparison.description}</p>
              <div className="mt-6 rounded-2xl bg-neutral-50 p-5">
                <div className="text-xs font-semibold normal-case tracking-wider text-neutral-500">Best for</div>
                <p className="mt-2 text-sm text-neutral-800">{comparison.bestFor}</p>
              </div>
            </section>

            <section className="mt-8 rounded-3xl border border-brand/20 bg-brand/5 p-8">
              <h2 className="text-2xl font-semibold tracking-tight">Where Rocket fits</h2>
              <p className="mt-4 text-base leading-8 text-neutral-700">
                Rocket is best when you want a logo-first brand system, not just a one-off file. Start with a mark, wordmark, or icon, then turn the winner into a full Brand Kit with Logo/Icon Files, Social Icons, Palette, Fonts, and a Brand Book — all in one project. Every asset can be refined in the canvas editor and exported as PNG, SVG, PDF, or a complete ZIP.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Button asChild size="lg">
                  <Link to="/signup">Try Rocket <ArrowRight className="h-4 w-4" /></Link>
                </Button>
                <Button asChild variant="outline" size="lg">
                  <Link to="/logos">Explore tools</Link>
                </Button>
              </div>
            </section>
          </div>

          <aside className="lg:pt-16">
            <div className="rounded-3xl border border-neutral-200 bg-neutral-50 p-6">
              <h3 className="text-lg font-semibold tracking-tight">More comparisons</h3>
              <ul className="mt-4 space-y-3 text-sm text-neutral-700">
                {others.map((item) => (
                  <li key={item.slug}>
                    <Link to={`/compare/${item.slug}`} className="hover:text-neutral-900 hover:underline">
                      Rocket vs {item.tool}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        </div>
      </main>

    </div>
  );
};

export default ComparisonDetail;
