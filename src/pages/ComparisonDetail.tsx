import { Link, useParams } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import { Button } from "@/components/ui/button";
import { comparisons, getComparison } from "@/content/comparisons";
import { useDocumentMeta } from "@/hooks/useDocumentMeta";

const ComparisonDetail = () => {
  const { slug } = useParams();
  const comparison = slug ? getComparison(slug) : null;

  useDocumentMeta({
    title: comparison ? `Rocket vs ${comparison.tool} — AI logo and brand tools compared` : "Comparison not found — Rocket",
    description: comparison ? `Compare Rocket with ${comparison.tool} for logos, icons, Brand Kits, editing and exports.` : undefined,
    canonical: comparison ? `https://tryrocket.ai/compare/${comparison.slug}` : undefined,
  });

  if (!comparison) {
    return (
      <div className="min-h-screen bg-white text-neutral-900">
        <SiteHeader />
        <main className="mx-auto max-w-3xl px-6 py-24 text-center">
          <h1 className="text-3xl font-semibold">Comparison not found</h1>
          <Link to="/" className="mt-6 inline-block text-brand hover:underline">← Back home</Link>
        </main>
        <SiteFooter />
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
                <div className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Best for</div>
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
      <SiteFooter />
    </div>
  );
};

export default ComparisonDetail;
