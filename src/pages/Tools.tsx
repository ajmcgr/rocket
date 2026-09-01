import { Link } from "react-router-dom";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import { tools } from "@/content/tools";
import { ArrowRight, Sparkles } from "lucide-react";
import { useDocumentMeta } from "@/hooks/useDocumentMeta";

const Tools = () => {
  useDocumentMeta({
    title: "Free AI branding tools for founders — Rocket",
    description: "Generate taglines, value propositions, names, pitches, bios and more with Rocket's free AI tools.",
    canonical: "https://tryrocket.ai/tools",
  });

  return <div className="min-h-screen bg-white text-neutral-900">
    <SiteHeader />
    <main className="mx-auto max-w-6xl px-6 py-16">
      <header className="text-center">
        <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-3 py-1 text-xs font-medium text-neutral-700">
          <Sparkles className="h-3.5 w-3.5 text-brand" /> 100% Free · No signup required
        </div>
        <h1 className="mt-6 text-4xl font-semibold tracking-tight sm:text-5xl">15 Free AI Tools for Founders</h1>
        <p className="mt-4 text-lg text-neutral-600">Tagline, value prop, brand name, pitch, bio — all in seconds.</p>
      </header>
      <div className="mt-14 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {tools.map((t) => (
          <Link key={t.slug} to={`/tools/${t.slug}`} className="group rounded-2xl border border-neutral-200 bg-white p-6 transition hover:border-brand hover:shadow-md">
            <h2 className="text-lg font-semibold tracking-tight group-hover:text-brand">{t.name}</h2>
            <p className="mt-2 text-sm text-neutral-600">{t.tagline}</p>
            <div className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-neutral-900">Try it free <ArrowRight className="h-3.5 w-3.5" /></div>
          </Link>
        ))}
      </div>
    </main>
    <SiteFooter />
  </div>;
};

export default Tools;
