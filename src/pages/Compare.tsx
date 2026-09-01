import { Link } from "react-router-dom";
import { ArrowRight, Scale } from "lucide-react";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import { comparisons } from "@/content/comparisons";
import { useDocumentMeta } from "@/hooks/useDocumentMeta";

const Compare = () => {
  useDocumentMeta({
    title: "Compare AI logo and branding tools — Rocket",
    description: "Founder-focused comparisons of Rocket and popular logo makers, icon generators and brand kit tools.",
    canonical: "https://tryrocket.ai/compare",
  });

  return <div className="min-h-screen bg-white text-neutral-900">
    <SiteHeader />
    <main className="mx-auto max-w-6xl px-6 py-16">
      <header className="text-center">
        <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-3 py-1 text-xs font-medium text-neutral-700">
          <Scale className="h-3.5 w-3.5 text-brand" /> Compare logo and branding tools
        </div>
        <h1 className="mt-6 text-4xl font-semibold tracking-tight sm:text-5xl">Rocket vs other branding tools</h1>
        <p className="mt-4 text-lg text-neutral-600">
          Quick founder-friendly breakdowns of the tools people compare Rocket against most often — logo makers, icon generators, brand kit builders, and full identity platforms.
        </p>
        <p className="mx-auto mt-3 max-w-2xl text-sm text-neutral-500">
          Where Rocket stands out: a logo-first workflow that starts with a mark or wordmark (Wizard, Logo Designer, Icon Designer, 300+ templates), then turns it into a canonical Brand Kit with Logo/Icon Files, Social Icons, Palette, Fonts, and a Brand Book — all editable in a canvas editor with PNG/SVG/PDF/ZIP export.
        </p>
      </header>

      <div className="mt-14 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {comparisons.map((comparison) => (
          <Link
            key={comparison.slug}
            to={`/compare/${comparison.slug}`}
            className="group rounded-2xl border border-neutral-200 bg-white p-6 transition hover:border-brand hover:shadow-md"
          >
            <div className="text-xs font-semibold uppercase tracking-wider text-neutral-400">#{comparison.rank}</div>
            <h2 className="mt-3 text-lg font-semibold tracking-tight group-hover:text-brand">
              Rocket vs {comparison.tool}
            </h2>
            <p className="mt-2 text-sm text-neutral-600">{comparison.bestFor}</p>
            <div className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-neutral-900">
              Read comparison <ArrowRight className="h-3.5 w-3.5" />
            </div>
          </Link>
        ))}
      </div>
    </main>
    <SiteFooter />
  </div>;
};

export default Compare;
