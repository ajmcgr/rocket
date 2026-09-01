import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { useDocumentMeta } from "@/hooks/useDocumentMeta";

const FAQS = [
  { q: "What does Rocket generate?", a: "Rocket is a logo-first design tool. Start with logo directions — a logo mark, matching wordmark, icon, colours and typography — then refine your favourite in the editor and roll it into a Brand Kit. Each Brand Kit contains Logo/Icon Files, Social Icons, Palette, Fonts, and Brand Book." },
  { q: "What are the main workflows?", a: "Four surfaces: Wizard (guided chat that generates logo directions from a URL or idea), Logo Designer & Icon Designer (batch generate marks and app icons in a chosen style), Templates (200+ ready-made logo and icon starters), and Saved (every design you star or open in the editor)." },
  { q: "How does the Brand Kit work?", a: "Every Brand Kit is organised into five sections: Logo/Icon Files, Social Icons, Palette, Fonts, and Brand Book. Swap or remove any item; Remove sends it to Trash and you can restore within 30 days. Add extras from any saved design via 'Use in brand kit'. Starter can view and share Brand Kits; every download inside a Brand Kit — the full Brand Kit ZIP, individual logo variants (PNG/SVG/PDF), Social Icons, and Brand Book (PDF/PNG) — is a Pro feature." },
  { q: "Can I edit designs like Canva?", a: "Yes. The editor supports multi-select (Shift-click + marquee), drag-resize, colour overlays for logos and images, image uploads with resize, layers on the right panel, Quick Edit for title/slogan/icon/layout/background, and export to PNG, SVG, PDF or ZIP." },
  { q: "How long does a generation take?", a: "Most logo batches land in 30–60 seconds. Your chat history persists per project so you can scroll back and iterate on earlier prompts." },
  { q: "Can I regenerate individual pieces?", a: "Yes. Every result has Edit, Save, Variants and Remix. Regenerating one design costs 1 credit; you can steer it with feedback like 'more minimal' or 'brighter'." },
  { q: "What's a credit?", a: "Credits power every generation. Free plan includes 100 credits/month, Pro includes 3,000. Top up anytime with credit packs — they never expire." },
  { q: "How does sharing and export work?", a: "Every design opens in the editor via a shareable link (new tab). Saved designs export freely from the editor as PNG, SVG or PDF. Brand Kit downloads (full ZIP, logo variants, Social Icons, Brand Book) require Pro. Pro also adds password-protected share links and PDF/Markdown brand guidelines." },
  { q: "What's included in Pro?", a: "3,000 credits/month, all Brand Kit downloads (full ZIP, logo variants, Social Icons, Brand Book PDF/PNG), workspaces & multi-seat, password-protected share links, brand guideline exports, and priority AI capacity. 7 days free, cancel anytime." },
  { q: "Can I cancel anytime?", a: "Yes, from Settings → Manage Billing. You keep access until the end of the period." },
];

const FAQ = () => {
  useDocumentMeta({
    title: "Rocket FAQ — AI logo generation, Brand Kits and credits",
    description: "Answers about Rocket's logo and icon workflows, Brand Kits, credits, editing, exports, sharing and billing.",
    canonical: "https://tryrocket.ai/faq",
  });

  return (
    <div className="min-h-screen bg-white text-neutral-900">
      <SiteHeader />

      <section className="border-b border-neutral-200/60">
        <div className="mx-auto max-w-3xl px-6 py-24">
          <div className="text-center">
            <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Frequently asked</h1>
            <p className="mt-3 text-neutral-600">Everything you wanted to know about Rocket.</p>
          </div>
          <Accordion type="single" collapsible className="mt-10 w-full space-y-4">
            {FAQS.map((f, i) => (
              <AccordionItem
                key={i}
                value={`item-${i}`}
                className="rounded-2xl border border-neutral-200 bg-white transition-all duration-300 hover:border-brand/30 data-[state=open]:ring-1 data-[state=open]:ring-brand data-[state=open]:shadow-lg data-[state=open]:shadow-brand/5"
              >
                <AccordionTrigger className="px-6 py-5 text-left text-lg font-semibold text-neutral-900">{f.q}</AccordionTrigger>
                <AccordionContent className="px-6 pb-5 text-neutral-600 leading-relaxed">{f.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
          <div className="mt-10 flex flex-col items-start justify-between gap-4 rounded-2xl border border-brand/10 bg-brand/5 p-6 sm:flex-row sm:items-center">
            <div>
              <p className="font-semibold text-neutral-900">Still have questions?</p>
              <p className="text-sm text-neutral-500">We're here to help you build something great.</p>
            </div>
            <Button asChild>
              <a href="mailto:alex@tryrocket.ai">Contact Support</a>
            </Button>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
};

export default FAQ;
