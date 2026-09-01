import { Link, useNavigate } from "react-router-dom";
import { Check, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase as _sb } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useDocumentMeta } from "@/hooks/useDocumentMeta";
const supabase = _sb as any;

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

const COMPARE = [
  { label: "Rocket Credits", starter: "Monthly starter allowance", pro: "Generous monthly allowance" },
  { label: "Logo Designer", starter: true, pro: true },
  { label: "Icon Designer", starter: true, pro: true },
  { label: "Templates library", starter: true, pro: true },
  { label: "Brand Kit", starter: "View & share", pro: "Full brand kit + Brand Book" },
  { label: "Brand Kit ZIP download", starter: false, pro: true },
  { label: "High-res file types", starter: "PNG & SVG", pro: "PNG, EPS, SVG, PDF" },
  { label: "Color variations", starter: "—", pro: "Multiple + transparent" },
  { label: "Post-purchase changes", starter: "Limited", pro: "Unlimited" },
  { label: "Full ownership", starter: false, pro: true },
  { label: "Exports", starter: "PNG & SVG", pro: "PNG, SVG, PDF, ZIP" },
  { label: "Saved designs", starter: "Limited", pro: "Unlimited" },
  { label: "Priority generation", starter: false, pro: true },
  { label: "Team workspaces", starter: false, pro: true },
  { label: "Early access to new generators", starter: false, pro: true },
];

const FAQS = [
  { q: "What is a Rocket Credit?", a: "Credits power everything you generate in Rocket — logos, icons, brand kits and exports. Every plan comes with a monthly allowance, and you can top up any time with credit packs." },
  { q: "Is there a free trial?", a: "Yes. Every plan starts with a 7-day free trial — no charge until it ends, cancel anytime." },
  { q: "What do I get when I upgrade to Pro?", a: "Pro unlocks a much larger monthly credit allowance, unlimited saved designs, multiple high-res file types (PNG, EPS, SVG, PDF), multiple color variations including transparent backgrounds, unlimited post-purchase changes, full ownership, team workspaces, and early access to new generators." },
  { q: "Can I cancel at any time?", a: "Yes. You can cancel or downgrade from Settings → Billing any time. Your Pro features stay active until the end of your billing period." },
  { q: "Do credits roll over?", a: "Plan credits refresh each month. One-time credit packs never expire and stack on top of your plan." },
];

const Pricing = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState<string | null>(null);
  const [billing, setBilling] = useState<"monthly" | "yearly">("yearly");

  useDocumentMeta({
    title: "Rocket pricing — AI logo and Brand Kit plans",
    description: "Compare Rocket Starter, Pro and Business plans, monthly credits, Brand Kit features and exports.",
    canonical: "https://tryrocket.ai/pricing",
  });

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
      navigate(`/signup?next=${encodeURIComponent(`/pricing?buy=${product}`)}`);
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

  const autoTriggered = useRef(false);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") !== "canceled") return;
    toast({ title: "Checkout canceled", description: "Nothing was charged. You can choose a plan whenever you're ready." });
    params.delete("checkout");
    window.history.replaceState({}, "", `${window.location.pathname}${params.size ? `?${params}` : ""}`);
  }, [toast]);

  useEffect(() => {
    if (autoTriggered.current || !user) return;
    const params = new URLSearchParams(window.location.search);
    const buy = params.get("buy");
    if (buy) {
      autoTriggered.current = true;
      startCheckout(buy);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  return (
    <div className="min-h-screen bg-white text-neutral-900">
      <SiteHeader />

      {/* Hero */}
      <section className="border-b border-neutral-200/60">
        <div className="mx-auto max-w-6xl px-6 pt-24 pb-16 text-center">
          <h1 className="text-4xl font-semibold tracking-tight sm:text-6xl">Pricing built for founders</h1>
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
      </section>

      {/* Plans */}
      <section>
        <div className="mx-auto max-w-6xl px-6 py-16">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
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
        </div>
      </section>

      {/* Feature comparison */}
      <section className="border-t border-neutral-200/60 bg-neutral-50/60">
        <div className="mx-auto max-w-5xl px-6 py-20">
          <div className="text-center">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Compare plans</h2>
            <p className="mt-3 text-neutral-600">Everything included in Starter and Pro.</p>
          </div>
          <div className="mt-10 overflow-hidden rounded-2xl border border-neutral-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-neutral-500">
                <tr>
                  <th className="px-6 py-4 text-left font-medium">Feature</th>
                  <th className="px-6 py-4 text-left font-medium">Starter</th>
                  <th className="px-6 py-4 text-left font-medium">Pro</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {COMPARE.map((row) => (
                  <tr key={row.label}>
                    <td className="px-6 py-4 font-medium text-neutral-900">{row.label}</td>
                    <td className="px-6 py-4 text-neutral-700">
                      {row.starter === true ? <Check className="h-4 w-4 text-neutral-900" /> : row.starter === false ? <span className="text-neutral-300">—</span> : row.starter}
                    </td>
                    <td className="px-6 py-4 text-neutral-700">
                      {row.pro === true ? <Check className="h-4 w-4 text-brand" /> : row.pro === false ? <span className="text-neutral-300">—</span> : row.pro}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Credit packs */}
      <section className="border-t border-neutral-200/60">
        <div className="mx-auto max-w-5xl px-6 py-20">
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
      </section>

      {/* FAQ */}
      <section className="border-t border-neutral-200/60 bg-neutral-50/60">
        <div className="mx-auto max-w-3xl px-6 py-20">
          <div className="text-center">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Frequently asked</h2>
          </div>
          <Accordion type="single" collapsible className="mt-10 w-full space-y-3">
            {FAQS.map((f, i) => (
              <AccordionItem key={i} value={`item-${i}`} className="rounded-2xl border border-neutral-200 bg-white">
                <AccordionTrigger className="px-6 py-5 text-left text-base font-semibold text-neutral-900">{f.q}</AccordionTrigger>
                <AccordionContent className="px-6 pb-5 text-sm leading-relaxed text-neutral-600">{f.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* Final CTA */}
      <section className="border-t border-neutral-200/60">
        <div className="mx-auto max-w-4xl px-6 py-24 text-center">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-5xl">Design your startup brand today</h2>
          <p className="mx-auto mt-4 max-w-xl text-neutral-600">Start with a 7-day free trial on any plan. Cancel anytime.</p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg" className="bg-brand text-white hover:bg-brand/90">
              <Link to={user ? "/logos" : "/signup"}>Start with Starter</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to={user ? "/settings/billing" : "/signup?next=%2Fpricing%3Fbuy%3Dgrowth"}>Upgrade to Pro</Link>
            </Button>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
};


export default Pricing;
