import { useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowRight, Check, Palette, Type } from "lucide-react";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import { Button } from "@/components/ui/button";
import { getTemplate, publicTemplates } from "@/data/templates";
import { track } from "@/lib/analytics";
import { useDocumentMeta } from "@/hooks/useDocumentMeta";

const SITE_URL = "https://tryrocket.ai";
const templatePath = (id: string) => `/brand-templates/${id}`;
const startPath = (id: string) => `/signup?next=${encodeURIComponent(`/projects/new?template=${id}`)}&ref=seo_template_${id}`;

const TemplateVisual = ({ template, compact = false }: { template: ReturnType<typeof publicTemplates>[number]; compact?: boolean }) => (
  <div className={`relative overflow-hidden rounded-2xl border border-neutral-200 ${compact ? "h-44" : "h-72"}`} style={{ background: template.colors[3] || "#F5F5F5" }}>
    <div className="absolute inset-x-6 top-6 flex items-center justify-between">
      <span className="rounded-full bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-600">{template.category}</span>
      <div className="flex -space-x-1.5">{template.colors.slice(0, 4).map((color) => <span key={color} className="h-5 w-5 rounded-full border-2 border-white" style={{ backgroundColor: color }} />)}</div>
    </div>
    <div className="absolute inset-x-6 bottom-6 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
      <div className="text-2xl font-semibold tracking-tight" style={{ color: template.colors[0], fontFamily: template.fonts[0] }}>
        {template.sampleName}
      </div>
      <div className="mt-1 text-xs text-neutral-500">{template.tagline}</div>
    </div>
  </div>
);

export const BrandTemplates = () => {
  const templates = publicTemplates();
  useDocumentMeta({
    title: "Brand templates for startups and small teams — Rocket",
    description: "Explore practical brand templates for SaaS, ecommerce, agencies, fintech, creators and wellness brands. Start with a reusable direction, then make it your own in Rocket.",
    canonical: `${SITE_URL}/brand-templates`,
  });

  return <div className="min-h-screen bg-white text-neutral-900">
    <SiteHeader />
    <main className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
      <header className="max-w-3xl">
        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Reusable brand directions</div>
        <h1 className="mt-5 text-4xl font-semibold tracking-tight sm:text-6xl">Brand templates built for real launch contexts.</h1>
        <p className="mt-5 text-lg leading-relaxed text-neutral-600">Each template is a usable starting direction—not a keyword page. See its audience, palette, typography, and voice, then start a Rocket project with those choices pre-filled.</p>
      </header>
      <section className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3" aria-label="Brand templates">
        {templates.map((template) => <Link key={template.id} to={templatePath(template.id)} className="group rounded-3xl border border-neutral-200 bg-white p-4 transition hover:border-neutral-900 hover:shadow-sm">
          <TemplateVisual template={template} compact />
          <div className="px-2 pb-2 pt-5">
            <div className="text-xs font-medium text-neutral-500">For {template.audience}</div>
            <h2 className="mt-2 text-xl font-semibold tracking-tight group-hover:text-brand">{template.name} Brand Template</h2>
            <p className="mt-2 text-sm leading-relaxed text-neutral-600">{template.description}</p>
            <div className="mt-4 inline-flex items-center gap-1 text-sm font-medium">Explore template <ArrowRight className="h-3.5 w-3.5" /></div>
          </div>
        </Link>)}
      </section>
    </main>
    <SiteFooter />
  </div>;
};

export const BrandTemplateDetail = () => {
  const { id } = useParams();
  const template = id ? getTemplate(id) : null;
  const eligible = template && publicTemplates().some((item) => item.id === template.id) ? template : null;
  const related = eligible ? publicTemplates().filter((item) => item.id !== eligible.id).slice(0, 3) : [];

  useDocumentMeta({
    title: eligible ? `${eligible.name} Brand Template for ${eligible.category} — Rocket` : "Brand template not found — Rocket",
    description: eligible ? `${eligible.description} Explore its ${eligible.tone.toLowerCase()} tone, palette and typography, then make it your own in Rocket.` : undefined,
    canonical: eligible ? `${SITE_URL}${templatePath(eligible.id)}` : undefined,
    robots: eligible ? "index,follow" : "noindex,follow",
  });

  useEffect(() => {
    if (eligible) track("organic_template_view", { page_type: "brand_template", template_id: eligible.id, category: eligible.category });
  }, [eligible]);

  if (!eligible) return <div className="min-h-screen bg-white text-neutral-900"><SiteHeader /><main className="mx-auto max-w-3xl px-6 py-24 text-center"><h1 className="text-3xl font-semibold">Brand template not found</h1><Link to="/brand-templates" className="mt-6 inline-block text-brand hover:underline">Browse brand templates</Link></main><SiteFooter /></div>;

  const canonical = `${SITE_URL}${templatePath(eligible.id)}`;
  const onStart = () => track("organic_template_cta", { page_type: "brand_template", template_id: eligible.id, destination: "project_wizard" });

  return <div className="min-h-screen bg-white text-neutral-900">
    <SiteHeader />
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
      "@context": "https://schema.org", "@type": "CreativeWork", name: `${eligible.name} Brand Template`,
      description: eligible.description, url: canonical, isAccessibleForFree: true,
      creator: { "@type": "Organization", name: "Rocket", url: SITE_URL },
      about: [eligible.category, eligible.audience, eligible.tone],
      breadcrumb: { "@type": "BreadcrumbList", itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
        { "@type": "ListItem", position: 2, name: "Brand Templates", item: `${SITE_URL}/brand-templates` },
        { "@type": "ListItem", position: 3, name: eligible.name, item: canonical },
      ] },
    }) }} />
    <main className="mx-auto max-w-6xl px-6 pb-24 pt-12">
      <nav aria-label="Breadcrumb" className="text-xs text-neutral-500"><ol className="flex items-center gap-2"><li><Link to="/" className="hover:text-neutral-900">Home</Link></li><li aria-hidden>/</li><li><Link to="/brand-templates" className="hover:text-neutral-900">Brand templates</Link></li><li aria-hidden>/</li><li>{eligible.name}</li></ol></nav>
      <div className="mt-10 grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_0.85fr]">
        <header>
          <div className="inline-flex rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1 text-xs font-medium text-neutral-600">{eligible.category} brand direction</div>
          <h1 className="mt-5 text-4xl font-semibold tracking-tight sm:text-6xl">{eligible.name} Brand Template</h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-neutral-600">{eligible.description} {eligible.tagline}</p>
          <div className="mt-8 flex flex-wrap gap-3"><Button asChild size="lg" onClick={onStart}><Link to={startPath(eligible.id)}>Use this template <ArrowRight className="h-4 w-4" /></Link></Button><Button asChild size="lg" variant="outline"><Link to="/brand-templates">Browse all templates</Link></Button></div>
          <p className="mt-3 text-xs text-neutral-500">Starts a free Rocket project with this template’s audience, tone, palette and fonts pre-filled.</p>
        </header>
        <TemplateVisual template={eligible} />
      </div>

      <div className="mt-20 grid gap-10 lg:grid-cols-3">
        <section className="rounded-3xl border border-neutral-200 p-7"><Palette className="h-5 w-5 text-brand" /><h2 className="mt-5 text-xl font-semibold">Palette</h2><p className="mt-2 text-sm leading-relaxed text-neutral-600">A five-colour system chosen for a {eligible.tone.toLowerCase()} identity.</p><div className="mt-6 flex overflow-hidden rounded-xl">{eligible.colors.map((color) => <div key={color} className="h-14 flex-1" title={color} style={{ backgroundColor: color }} />)}</div><div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-neutral-500">{eligible.colors.map((color) => <span key={color}>{color}</span>)}</div></section>
        <section className="rounded-3xl border border-neutral-200 p-7"><Type className="h-5 w-5 text-brand" /><h2 className="mt-5 text-xl font-semibold">Typography</h2><p className="mt-2 text-sm leading-relaxed text-neutral-600">Use {eligible.fonts[0]} for headings and {eligible.fonts[1]} for body copy to preserve the intended hierarchy.</p><div className="mt-6 rounded-xl bg-neutral-50 p-4"><div className="text-xl font-semibold">{eligible.fonts[0]}</div><div className="mt-1 text-sm text-neutral-500">{eligible.fonts[1]}</div></div></section>
        <section className="rounded-3xl border border-neutral-200 p-7"><Check className="h-5 w-5 text-brand" /><h2 className="mt-5 text-xl font-semibold">Voice</h2><p className="mt-2 text-sm leading-relaxed text-neutral-600">{eligible.voiceNotes}</p><div className="mt-6 rounded-xl bg-neutral-50 p-4 text-sm text-neutral-600">Designed for: <span className="font-medium text-neutral-900">{eligible.audience}</span></div></section>
      </div>

      <section className="mt-16 rounded-3xl border border-brand/20 bg-brand/5 p-8 sm:p-10"><h2 className="text-2xl font-semibold tracking-tight">Make the direction yours.</h2><p className="mt-3 max-w-2xl leading-relaxed text-neutral-700">Rocket uses this starter context to pre-fill your project. Change the name and description, then generate the logo, colour system, typography, brand voice, and launch copy your product needs.</p><Button asChild className="mt-6" onClick={onStart}><Link to={startPath(eligible.id)}>Start with {eligible.name} <ArrowRight className="h-4 w-4" /></Link></Button></section>

      {related.length > 0 && <section className="mt-20 border-t border-neutral-200 pt-12"><h2 className="text-2xl font-semibold tracking-tight">Related brand templates</h2><div className="mt-8 grid gap-5 sm:grid-cols-3">{related.map((item) => <Link key={item.id} to={templatePath(item.id)} className="rounded-2xl border border-neutral-200 p-5 transition hover:border-neutral-900"><div className="flex gap-1">{item.colors.slice(0, 4).map((color) => <span key={color} className="h-5 w-5 rounded-full border border-neutral-200" style={{ backgroundColor: color }} />)}</div><h3 className="mt-5 font-semibold">{item.name}</h3><p className="mt-2 text-sm text-neutral-600">{item.category} · {item.tone}</p></Link>)}</div></section>}
    </main>
    <SiteFooter />
  </div>;
};
