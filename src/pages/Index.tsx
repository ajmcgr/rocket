import { Link, useNavigate } from "react-router-dom";
import { useState, useRef } from "react";
import { ArrowRight, ArrowUp, Sparkles, Zap, Target, Rocket as RocketIcon, Megaphone, ListChecks, Check, Loader2, Smartphone, Mail, Palette, ShoppingBag, Building2, Puzzle, Mic, BookOpen, Wrench, Lightbulb, Paperclip, X, BookMarked, LayoutTemplate, Shapes, Type as TypeIcon, Image as ImageIcon, Box, Sparkle, BarChart3, Play, Pause } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase as _sb } from "@/integrations/supabase/client";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import CreateShowcase from "@/components/CreateShowcase";
import FeaturedLogos from "@/components/FeaturedLogos";
import SenjaWidget from "@/components/SenjaWidget";
import rocketVideo from "@/assets/rocket.mp4.asset.json";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
const supabase = _sb as any;

const FAQS = [
  { q: "What does Rocket generate?", a: "Rocket is a logo-first design tool. Start with logo directions — a logo mark, matching wordmark, icon, colours and typography — then refine your favourite in the editor and roll it into a Brand Kit." },
  { q: "What are the main workflows?", a: "Wizard (guided chat that generates logo directions from a URL or idea), Logo Designer & Icon Designer (batch generate marks and app icons in a chosen style), Templates (200+ ready-made logo and icon starters), and Saved (every design you star or open in the editor)." },
  { q: "How does the Brand Kit work?", a: "Every Brand Kit holds one canonical item per category — logo, colours, typography, design system, and more. Swap or remove any item; Remove sends it to Trash and you can restore within 30 days. Add extras from any saved design via 'Use in brand kit'." },
  { q: "Can I edit designs like Canva?", a: "Yes. Multi-select (Shift-click + marquee), drag-resize, colour overlays for logos and images, image uploads with resize, layers on the right, Quick Edit for title/slogan/icon/layout/background, and export to PNG/SVG/PDF/ZIP." },
  { q: "How long does a generation take?", a: "Most logo batches land in 30–60 seconds. Chat history persists per project so you can scroll back and iterate." },
  { q: "Can I regenerate individual pieces?", a: "Yes. Every result has Edit, Save, Variants and Remix. Regenerating one design costs 1 credit, and you can steer it with feedback like 'more minimal' or 'brighter'." },
  { q: "What's a credit?", a: "Credits power every generation. Starter includes 500/month, Pro includes 3,000. Every plan starts with a 7-day free trial. Top up anytime — packs never expire." },
  { q: "How does sharing and export work?", a: "Every design opens in the editor via a shareable link (new tab). Export PNG, SVG, PDF, or a full ZIP of your Brand Kit. Pro adds password-protected share links and PDF/Markdown brand guidelines." },
  { q: "What's included in Pro?", a: "3,000 credits/month, workspaces & multi-seat, password-protected share links, brand guideline exports, and priority AI capacity. 7 days free, cancel anytime." },
  { q: "Can I cancel anytime?", a: "Yes, from Settings → Manage Billing. You keep access until the end of the period." },
];

const STARTER_FEATURES = [
  "Monthly Rocket Credits to design your first logo",
  "Logo & Icon Designer",
  "Brand Kit essentials (view & share)",
  "Full template library",
  "PNG & SVG downloads",
];

const PRO_FEATURES = [
  "Generous monthly Rocket Credits",
  "Unlimited saved logos & brand kits",
  "Multiple high-res file types (PNG, EPS, SVG, PDF)",
  "Multiple color variations (including transparent backgrounds)",
  "Unlimited post-purchase changes",
  "Full ownership",
  "Brand Kit ZIP downloads",
  "Priority generation",
  "Team workspaces (multi-seat)",
  "Brand Book & guideline export",
  "Early access to new generators",
];

const BUSINESS_FEATURES = [
  "Everything in Pro",
  "5× the monthly Rocket Credits",
  "Highest priority generation queue",
  "Larger team workspaces",
  "Dedicated onboarding & support",
];

const UseCaseVisual = ({ kind, accent }: { kind: string; accent: string }) => {
  if (kind === "saas") {
    return (
      <div className="absolute inset-6 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <div className={`h-6 w-6 rounded-md ${accent}`} />
          <div className="h-2 w-20 rounded-full bg-neutral-200" />
          <div className="ml-auto flex gap-1.5">
            {[0, 1, 2].map((k) => <div key={k} className="h-1.5 w-1.5 rounded-full bg-neutral-300" />)}
          </div>
        </div>
        <div className="grid flex-1 grid-cols-3 gap-2">
          <div className="space-y-2 rounded-xl bg-white p-3 ring-1 ring-neutral-200/70">
            {[60, 40, 80, 50].map((w, k) => <div key={k} className="h-1.5 rounded-full bg-neutral-200" style={{ width: `${w}%` }} />)}
          </div>
          <div className="col-span-2 flex flex-col gap-2 rounded-xl bg-white p-3 ring-1 ring-neutral-200/70">
            <div className="h-2 w-24 rounded-full bg-neutral-200" />
            <div className={`h-16 rounded-lg ${accent} opacity-90`} />
            <div className="flex gap-2">
              <div className="h-8 flex-1 rounded-lg bg-neutral-100" />
              <div className="h-8 flex-1 rounded-lg bg-neutral-100" />
              <div className="h-8 flex-1 rounded-lg bg-neutral-100" />
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (kind === "ai") {
    return (
      <div className="absolute inset-6 flex flex-col justify-end gap-2.5">
        <div className="self-start max-w-[70%] rounded-2xl rounded-bl-md bg-white px-4 py-2.5 text-xs text-neutral-700 ring-1 ring-neutral-200/70">
          Summarize my Q3 launch wins ✨
        </div>
        <div className={`self-end max-w-[80%] rounded-2xl rounded-br-md ${accent} px-4 py-2.5 text-xs text-white`}>
          You shipped 4 features, gained 1,284 users, and trended #2 on Product Hunt.
        </div>
        <div className="self-start flex items-center gap-1.5 rounded-2xl bg-white px-3 py-2 ring-1 ring-neutral-200/70">
          {[0, 1, 2].map((k) => <span key={k} className="h-1.5 w-1.5 rounded-full bg-neutral-400" />)}
        </div>
      </div>
    );
  }
  if (kind === "ecom") {
    return (
      <div className="absolute inset-6 grid grid-cols-2 gap-3">
        {[0, 1, 2, 3].map((k) => (
          <div key={k} className="flex flex-col rounded-xl bg-white p-2.5 ring-1 ring-neutral-200/70">
            <div className={`h-14 rounded-lg ${accent} opacity-${80 - k * 10}`} />
            <div className="mt-2 h-1.5 w-16 rounded-full bg-neutral-200" />
            <div className="mt-1.5 h-1.5 w-10 rounded-full bg-neutral-100" />
            <div className="mt-auto flex items-center justify-between pt-2">
              <div className="h-2 w-8 rounded-full bg-neutral-300" />
              <div className={`h-5 w-5 rounded-full ${accent}`} />
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (kind === "mobile") {
    return (
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="relative h-[88%] w-[46%] rounded-[2rem] bg-neutral-900 p-2">
          <div className="flex h-full flex-col gap-2 rounded-[1.5rem] bg-white p-3">
            <div className="mx-auto mt-1 h-1 w-10 rounded-full bg-neutral-900" />
            <div className={`mt-2 h-10 w-10 rounded-xl ${accent}`} />
            <div className="h-2 w-20 rounded-full bg-neutral-200" />
            <div className="h-1.5 w-16 rounded-full bg-neutral-100" />
            <div className={`mt-2 h-20 rounded-xl ${accent} opacity-90`} />
            <div className="space-y-1.5">
              <div className="h-1.5 w-full rounded-full bg-neutral-100" />
              <div className="h-1.5 w-3/4 rounded-full bg-neutral-100" />
            </div>
          </div>
        </div>
      </div>
    );
  }
  // side
  return (
    <div className="absolute inset-6 grid grid-cols-3 gap-2.5">
      {["Idea", "Build", "Ship"].map((c, k) => (
        <div key={c} className="flex flex-col gap-2 rounded-xl bg-white p-2.5 ring-1 ring-neutral-200/70">
          <div className="flex items-center gap-1.5">
            <span className={`h-1.5 w-1.5 rounded-full ${accent}`} />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">{c}</span>
          </div>
          {Array.from({ length: 3 - (k === 2 ? 1 : 0) }).map((_, j) => (
            <div key={j} className="rounded-lg bg-neutral-50 p-2 ring-1 ring-neutral-100">
              <div className="h-1.5 w-14 rounded-full bg-neutral-200" />
              <div className="mt-1.5 h-1.5 w-10 rounded-full bg-neutral-100" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};

const Index = () => {
  const { user } = useAuth();
  const nav = useNavigate();
  const { toast } = useToast();
  const [url, setUrl] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [images, setImages] = useState<string[]>([]);
  const [isPlaying, setIsPlaying] = useState(true);
  const [billing, setBilling] = useState<"monthly" | "yearly">("yearly");
  const [loading, setLoading] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const priceFor = (base: "starter" | "growth" | "business") => {
    const monthly = base === "starter" ? 12 : base === "growth" ? 20 : 50;
    if (billing === "monthly") return { display: `$${monthly}`, suffix: "/month" };
    const yearly = base === "starter" ? 99 : base === "growth" ? 166 : 415;
    return { display: `$${yearly}`, suffix: "/year" };
  };
  const productId = (base: "starter" | "growth" | "business") =>
    billing === "yearly" ? `${base}_yearly` : base;

  const startCheckout = async (product: string) => {
    if (!user) {
      nav(`/signup?next=${encodeURIComponent(`/pricing?buy=${product}`)}`);
      return;
    }
    setLoading(product);
    try {
      const { data, error } = await supabase.functions.invoke("stripe-checkout", { body: { product } });
      if (error) throw error;
      if ((data as any)?.url) window.location.href = (data as any).url;
    } catch (e: any) {
      toast({ title: "Checkout failed", description: e.message, variant: "destructive" });
      setLoading(null);
    }
  };

  const onPickFiles = async (files: FileList | null) => {
    if (!files) return;
    const next: string[] = [];
    for (const f of Array.from(files)) {
      if (!f.type.startsWith("image/")) continue;
      if (f.size > 8 * 1024 * 1024) continue;
      const dataUrl: string = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = reject;
        r.readAsDataURL(f);
      });
      next.push(dataUrl);
    }
    setImages((prev) => [...prev, ...next].slice(0, 6));
  };

  const CATEGORIES = [
    { label: "Logos", slug: "logos", Icon: Shapes },
    { label: "Icons", slug: "icons", Icon: Puzzle },
    { label: "Brand Templates", slug: "brand-templates", Icon: LayoutTemplate },
    { label: "Brand Guidelines", slug: "brand-guidelines", Icon: BookMarked },
    { label: "Colors", slug: "colors", Icon: Palette },
    { label: "Fonts", slug: "fonts", Icon: TypeIcon },
    { label: "Brand voice", slug: "brand-voice", Icon: Mic },
    { label: "Photos", slug: "photos", Icon: ImageIcon },
    { label: "Components", slug: "components", Icon: Box },
    { label: "Graphics", slug: "graphics", Icon: Sparkle },
    { label: "Launch Copy", slug: "launch-copy", Icon: Megaphone },
  ];

  const toggleCategory = (slug: string) => {
    setSelected((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]
    );
  };


  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed && images.length === 0) return;
    let finalUrl = trimmed;
    if (trimmed && selected.length > 0) {
      const focus = selected.join(",");
      finalUrl = `${finalUrl.replace(/#focus=.*$/, "").trim()}#focus=${focus}`;
    }
    if (images.length > 0) {
      try { sessionStorage.setItem("gen_images", JSON.stringify(images)); } catch {}
    }
    const target = finalUrl ? `/create?url=${encodeURIComponent(finalUrl)}` : "/create";
    if (user) nav(target);
    else nav("/signup", { state: { from: target } });
  };

  return (
    <div className="min-h-screen bg-white text-neutral-900">
      <SiteHeader />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-40 -z-10 mx-auto h-[600px] w-[1200px] rounded-full opacity-50 blur-3xl"
          style={{
            background:
              "radial-gradient(closest-side, rgba(59,130,246,0.30), rgba(59,130,246,0) 70%), radial-gradient(closest-side, rgba(120,140,255,0.20), rgba(120,140,255,0) 70%)",
          }}
        />
        <div className="mx-auto max-w-6xl px-6 pt-20 pb-16 text-center sm:pt-28 sm:pb-20">
          <h1 className="mx-auto max-w-4xl text-4xl font-medium tracking-tight text-neutral-900 sm:text-6xl md:text-7xl">
            Create a Logo People Remember
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg font-normal leading-relaxed text-neutral-500 sm:text-xl">
            From a URL or a few words, Rocket generates logo directions, a wordmark, icon, colours and typography. Pick one, refine it, and build your brand kit.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-6 sm:flex-row">
            <Button asChild variant="brand" size="lg" className="h-12 px-8">
              <Link to="/signup">
                Start Free Trial
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <div className="w-auto">
              <SenjaWidget />
            </div>
          </div>
          <div className="mx-auto mt-6 flex flex-wrap items-center justify-center gap-x-8 gap-y-2 text-sm text-neutral-600">
            {["7-day free trial", "Secure payment", "Cancel any-time"].map((item) => (
              <span key={item} className="inline-flex items-center gap-2">
                <Check className="h-4 w-4 text-brand" strokeWidth={2.5} />
                {item}
              </span>
            ))}
          </div>
        </div>
        <div className="mx-auto mt-6 w-full max-w-[76rem] px-6 pb-24 sm:pb-32">
          <div className="mx-auto w-full overflow-hidden rounded-xl bg-neutral-100 shadow-[0_20px_60px_-20px_rgba(15,23,42,0.25)] ring-1 ring-neutral-200">
            <div className="flex h-8 items-center gap-1.5 border-b border-neutral-200 bg-neutral-100 px-3">
              <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
              <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
              <span className="h-3 w-3 rounded-full bg-[#28c840]" />
            </div>
            <div className="relative">
              <video
                ref={videoRef}
                src={rocketVideo.url}
                autoPlay
                muted
                loop
                playsInline
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                className="block h-auto w-full bg-white"
              />
              <button
                onClick={() => {
                  if (!videoRef.current) return;
                  if (isPlaying) videoRef.current.pause();
                  else videoRef.current.play();
                }}
                className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 flex h-20 w-20 items-center justify-center rounded-full bg-white shadow-[0_12px_48px_-12px_rgba(0,0,0,0.14)] ring-1 ring-neutral-200/50 transition-all hover:scale-105 hover:shadow-[0_16px_56px_-12px_rgba(0,0,0,0.18)] focus:outline-none focus:ring-2 focus:ring-[#1676e3]"
                aria-label={isPlaying ? "Pause video" : "Play video"}
              >
                {isPlaying ? <Pause className="h-8 w-8 fill-neutral-900 text-neutral-900" strokeWidth={2} /> : <Play className="h-8 w-8 fill-neutral-900 text-neutral-900" strokeWidth={2} />}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* What you can create */}
      <CreateShowcase />

      {/* Featured logos made with Rocket */}
      <FeaturedLogos />

      {/* Use Cases */}
      <section id="use-cases" className="border-t border-neutral-200/60">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-4xl font-medium tracking-tight sm:text-5xl">Your logo first. Your brand kit next.</h2>
            <p className="mt-4 text-lg text-neutral-600">
              Choose one direction you love, then let it guide your complete Brand Kit — Logo/Icon Files, Social Icons, Palette, Fonts, and Brand Book — all in one place.
            </p>
          </div>
          <div className="mt-14 space-y-6">
            {[
              {
                icon: Zap,
                accent: "bg-indigo-500",
                tint: "bg-indigo-50",
                title: "SaaS products",
                desc: "Launch your next software empire with a logo, icon, wordmark, colour palette, typography and a shareable Brand Book — all in one kit.",
                visual: "saas",
              },
              {
                icon: Sparkles,
                accent: "bg-violet-600",
                tint: "bg-fuchsia-50",
                title: "AI tools",
                desc: "Stand out in a sea of GPT wrappers. Rocket gives your AI product a distinctive logo, wordmark, social icons and a complete Brand Kit.",
                visual: "ai",
              },
              {
                icon: ShoppingBag,
                accent: "bg-rose-500",
                tint: "bg-rose-50",
                title: "E-commerce stores",
                desc: "Build a conversion-ready brand identity — logo, favicon, colour palette, typography and a Brand Book you can use across every channel.",
                visual: "ecom",
              },
              {
                icon: Smartphone,
                accent: "bg-sky-500",
                tint: "bg-sky-50",
                title: "Mobile apps",
                desc: "App Store-ready branding. Generate your app icon, logo, wordmark, colours, fonts and a Brand Book for launch.",
                visual: "mobile",
              },
              {
                icon: Lightbulb,
                accent: "bg-blue-600",
                tint: "bg-blue-50",
                title: "Side projects",
                desc: "Turn weekend ideas into polished ventures. Rocket gives every side project a logo, icon, wordmark and a brand kit that looks funded.",
                visual: "side",
              },
            ].map((row, i) => {
              const reverse = i % 2 === 1;
              return (
                <div
                  key={row.title}
                  className="overflow-hidden rounded-3xl bg-white ring-1 ring-neutral-200/70"
                >
                  <div className={`grid items-center gap-8 p-8 sm:p-12 md:grid-cols-2 md:gap-12 ${reverse ? "md:[&>*:first-child]:order-2" : ""}`}>
                    <div>
                      <h3 className="text-3xl font-medium tracking-tight text-neutral-900 sm:text-4xl">{row.title}</h3>
                      <p className="mt-4 text-base leading-relaxed text-neutral-600">{row.desc}</p>
                      <Button asChild className="mt-7">
                        <Link to="/logos">
                          Start free <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                      </Button>
                    </div>
                    <div className={`relative aspect-[4/3] overflow-hidden rounded-2xl ${row.tint} ring-1 ring-neutral-200/70`}>
                      <UseCaseVisual kind={row.visual} accent={row.accent} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="border-t border-neutral-200/60">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-4xl font-semibold tracking-tight sm:text-6xl">Pricing built for founders</h2>
            <p className="mx-auto mt-5 max-w-2xl text-lg text-neutral-600">Start free and design your first brand today. Upgrade to Pro when you're ready to grow.</p>
            <div className="mt-8 inline-flex items-center rounded-full border border-neutral-200 bg-white p-1 text-sm">
              <button
                type="button"
                onClick={() => setBilling("monthly")}
                className={`rounded-full px-4 py-1.5 font-medium transition ${billing === "monthly" ? "bg-neutral-900 text-white" : "text-neutral-600 hover:text-neutral-900"}`}
              >
                Monthly
              </button>
              <button
                type="button"
                onClick={() => setBilling("yearly")}
                className={`rounded-full px-4 py-1.5 font-medium transition ${billing === "yearly" ? "bg-neutral-900 text-white" : "text-neutral-600 hover:text-neutral-900"}`}
              >
                Yearly <span className={billing === "yearly" ? "text-white/70" : "text-brand"}>Save ~17%</span>
              </button>
            </div>
          </div>
          <div className="mt-14 grid grid-cols-1 gap-6 md:grid-cols-3">
            {/* Starter */}
            <div className="relative rounded-2xl border border-neutral-200 bg-white p-8">
              <div className="text-sm font-semibold uppercase tracking-wider text-neutral-500">Starter</div>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="text-5xl font-semibold tracking-tight">{priceFor("starter").display}</span>
                <span className="text-sm text-neutral-500">{priceFor("starter").suffix}</span>
              </div>
              <p className="mt-2 text-sm text-neutral-600">Everything you need to create your first startup brand.</p>
              <ul className="mt-6 space-y-3 text-sm">
                {STARTER_FEATURES.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-neutral-900" />
                    <span className="text-neutral-700">{f}</span>
                  </li>
                ))}
              </ul>
              <Button
                onClick={() => startCheckout(productId("starter"))}
                disabled={loading === productId("starter")}
                variant="outline"
                className="mt-8 w-full"
              >
                {loading === productId("starter") ? <Loader2 className="h-4 w-4 animate-spin" /> : "Start 7-day free trial"}
              </Button>
            </div>

            {/* Pro */}
            <div className="relative rounded-2xl border border-neutral-200 bg-neutral-100 p-8 text-neutral-900">
              <div className="absolute -top-3 right-6 rounded-full bg-brand px-3 py-1 text-xs font-semibold text-white">
                Most popular
              </div>
              <div className="text-sm font-semibold uppercase tracking-wider text-neutral-500">Pro</div>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="text-5xl font-semibold tracking-tight">{priceFor("growth").display}</span>
                <span className="text-neutral-500">{priceFor("growth").suffix}</span>
              </div>
              <p className="mt-2 text-sm text-neutral-600">Everything serious founders need to build and grow their brand.</p>
              <ul className="mt-6 space-y-3 text-sm">
                {PRO_FEATURES.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <Button
                onClick={() => startCheckout(productId("growth"))}
                disabled={loading === productId("growth")}
                variant="outline"
                className="mt-8 w-full"
              >
                {loading === productId("growth") ? <Loader2 className="h-4 w-4 animate-spin" /> : "Upgrade to Pro"}
              </Button>
            </div>

            {/* Business */}
            <div className="relative rounded-2xl border border-neutral-200 bg-white p-8">
              <div className="text-sm font-semibold uppercase tracking-wider text-neutral-500">Business</div>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="text-5xl font-semibold tracking-tight">{priceFor("business").display}</span>
                <span className="text-sm text-neutral-500">{priceFor("business").suffix}</span>
              </div>
              <p className="mt-2 text-sm text-neutral-600">For teams and agencies building multiple brands at scale.</p>
              <ul className="mt-6 space-y-3 text-sm">
                {BUSINESS_FEATURES.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-neutral-900" />
                    <span className="text-neutral-700">{f}</span>
                  </li>
                ))}
              </ul>
              <Button
                onClick={() => startCheckout(productId("business"))}
                disabled={loading === productId("business")}
                variant="outline"
                className="mt-8 w-full"
              >
                {loading === productId("business") ? <Loader2 className="h-4 w-4 animate-spin" /> : "Upgrade to Business"}
              </Button>
            </div>
          </div>

          <div className="mt-8 text-center">
            <Link to="/pricing" className="text-sm font-medium text-brand hover:underline">
              Compare all features
            </Link>
          </div>

          {/* Credit packs */}
          <div className="mt-14">
            <div className="text-center">
              <h2 className="text-3xl font-semibold tracking-tight">Need more credits?</h2>
              <p className="mt-2 text-neutral-600">One-time credit packs. Never expire. Stack with your plan.</p>
            </div>
            <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
              {[
                { id: "pack_500", credits: "500", price: "$5", note: "Starter pack" },
                { id: "pack_1500", credits: "1,500", price: "$10", note: "Most popular", highlight: true },
                { id: "pack_5000", credits: "5,000", price: "$25", note: "Best value" },
              ].map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => startCheckout(p.id)}
                  disabled={loading === p.id}
                  className={`rounded-2xl border p-6 text-left transition hover:shadow-sm disabled:opacity-60 ${p.highlight ? "border-brand bg-brand/5 hover:bg-brand/10" : "border-neutral-200 bg-white hover:border-neutral-300"}`}
                >
                  <div className="text-xs font-semibold uppercase tracking-wider text-neutral-500">{p.note}</div>
                  <div className="mt-2 flex items-baseline gap-1">
                    <span className="text-4xl font-semibold tracking-tight">{p.price}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-sm font-medium text-neutral-900">
                    {loading === p.id && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    {p.credits} credits
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="border-t border-neutral-200/60 bg-neutral-50/50">
        <div className="mx-auto max-w-3xl px-6 py-24">
          <div className="text-center">
            <h2 className="text-3xl font-medium tracking-tight sm:text-4xl">Frequently asked</h2>
            <p className="mt-3 text-neutral-600">Everything you wanted to know about Rocket.</p>
          </div>
          <Accordion type="single" collapsible className="mt-10 w-full space-y-4">
            {FAQS.map((f, i) => (
              <AccordionItem
                key={i}
                value={`item-${i}`}
                className="rounded-2xl border border-neutral-200 bg-white transition-all duration-300 hover:border-brand/30 data-[state=open]:ring-1 data-[state=open]:ring-brand data-[state=open]:shadow-lg data-[state=open]:shadow-brand/5"
              >
                <AccordionTrigger className="px-6 py-5 text-left text-base font-semibold text-neutral-900">{f.q}</AccordionTrigger>
                <AccordionContent className="px-6 pb-5 text-sm text-neutral-600 leading-relaxed">{f.a}</AccordionContent>
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

      {/* CTA */}
      <section className="border-t border-neutral-200/60">
        <div className="mx-auto max-w-4xl px-6 py-24 text-center">
          <h2 className="text-3xl font-medium tracking-tight sm:text-5xl">Ready to make your logo?</h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-neutral-600">
            Start with a logo direction. Build the rest of your brand when you are ready.
          </p>
          <Button asChild size="lg" className="mt-8">
            <Link to="/signup">Create your logo <ArrowRight className="h-4 w-4" /></Link>
          </Button>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
};

export default Index;
