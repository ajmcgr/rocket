import { Loader2 as ControlLoader2 } from "lucide-react";
import { Link, useNavigate } from "@/lib/router-compat";
import { Check, Loader2 } from "@/components/EmojiIcons";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase as _sb } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useDocumentMeta } from "@/hooks/useDocumentMeta";
import { track } from "@/lib/analytics";
const supabase = _sb as any;

const STARTER_FEATURES = [
  "500 Rocket Credits each month",
  "Logo & Icon Designer",
  "Brand Kit essentials (view & share)",
  "Full template library",
  "PNG & SVG downloads",
];

const PRO_FEATURES = [
  "3,000 Rocket Credits each month",
  "Unlimited saved logos & brand kits",
  "Multiple high-res file types (PNG, EPS, SVG, PDF)",
  "Multiple color variations (including transparent backgrounds)",
  "Unlimited post-purchase changes",
  "Full ownership",
  "Brand Kit ZIP downloads",
  "Priority generation",
  "Team workspace access",
  "Brand Book & guideline export",
  "Early access to new generators",
];

const BUSINESS_FEATURES = [
  "Everything in Pro",
  "15,000 Rocket Credits each month",
  "Highest priority generation queue",
  "Larger team workspaces",
  "Dedicated onboarding & support",
];

const COMPARE = [
  { label: "Rocket Credits", starter: "500 / month", pro: "3,000 / month" },
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
  { label: "Team workspace access", starter: false, pro: true },
  { label: "Early access to new generators", starter: false, pro: true },
];

const FAQS = [
  { q: "When does Rocket take 10%?", a: "Only when an eligible connected app processes a purchase through Buy with Rocket. Rocket ID by itself has no subscription or revenue-share fee. Buy with Rocket currently runs as a test-mode developer pilot, not a production checkout for catalogue apps." },
  { q: "Are Stripe fees included in Rocket's 10%?", a: "No. Rocket's platform fee is separate from Stripe processing fees and any other applicable charges. A $100 purchase leaves $90 for the app before those separate costs." },
  { q: "What is a Rocket Credit?", a: "Credits power everything you generate. Free includes 500 credits; Starter includes 500/month, Pro 3,000/month, and Business 15,000/month. One-time credit packs never expire." },
  { q: "How is Free different from Starter?", a: "Free includes 500 one-time credits and no card. Starter renews 500 credits every month and adds PNG and SVG downloads. Choose Starter when you need ongoing generation or files to use outside Rocket." },
  { q: "What do I get when I upgrade to Pro?", a: "Pro includes 3,000 credits/month, unlimited saved designs, high-res PNG, EPS, SVG and PDF exports, color variations, full ownership, team workspace access, and priority generation." },
  { q: "Can I cancel at any time?", a: "Yes. You can cancel or downgrade from Settings → Billing any time. Your Pro features stay active until the end of your billing period." },
  { q: "Do credits roll over?", a: "Plan credits refresh each month. One-time credit packs never expire and stack on top of your plan." },
];

const GROW_PRODUCTS = [
  {
    name: "Launch",
    description: "Launch your app and reach a community of vibe coders and early adopters.",
    plans: ["Free listing · $0", "Pro · $39", "Grow · $199", "Pass · $99/year"],
    href: "https://trylaunch.ai/pricing",
  },
  {
    name: "Post",
    description: "Plan and publish across social channels from one place.",
    plans: ["Free · $0", "Pro · $19/month"],
    href: "https://trypost.ai/pricing",
  },
  {
    name: "Media",
    description: "Find journalists and creators, build lists, and manage outreach.",
    plans: ["Free AI credits", "Starter · $29/month", "Growth · $99/month", "Enterprise · custom"],
    href: "https://trymedia.ai/pricing",
  },
] as const;

const Pricing = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState<string | null>(null);
  const [billing, setBilling] = useState<"monthly" | "yearly">("yearly");

  useDocumentMeta({
    title: "Rocket pricing — apps, Create, Monetize and Grow",
    description: "See free app listings, Rocket Create plans, Rocket ID and Buy with Rocket pricing, plus Grow products.",
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
      track("checkout_started", { product, source: "pricing" });
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
    track("pricing_viewed", { source: "pricing_page" });
  }, []);

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

      <div className="mx-auto max-w-6xl px-6 pt-20 pb-10 sm:pt-24">
          <h1 className="text-4xl font-semibold tracking-tight sm:text-6xl">Rocket pricing</h1>
          <p className="mt-5 max-w-2xl text-lg text-neutral-600">Submit and manage your apps for free. Create, monetize, and grow with the products that fit your work.</p>
      </div>

      <section className="border-b border-neutral-200/60">
        <div className="mx-auto max-w-6xl px-6 pb-20 text-center">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Your apps</h2>
          <p className="mx-auto mt-4 max-w-2xl text-neutral-600">Your Rocket listing and app workspace are free.</p>
          <div className="mt-10 grid gap-5 text-left md:grid-cols-2">
            <div className="flex flex-col rounded-2xl border border-neutral-200 bg-white p-7 sm:p-8">
              <h3 className="text-2xl font-semibold tracking-tight">Your Apps</h3>
              <p className="mt-4 text-5xl font-semibold tracking-tight">Free</p>
              <p className="mt-4 flex-1 text-neutral-600">See apps you own or claim, improve public profiles, and manage available trust connections.</p>
              <Link to="/your-apps" className="mt-7 inline-flex min-h-11 items-center justify-center rounded-xl border border-[#167ac6] px-5 text-sm font-semibold text-[#167ac6] hover:bg-neutral-50 dark:text-[#dcefff]">Open Your Apps →</Link>
            </div>
            <div className="flex flex-col rounded-2xl border border-neutral-200 bg-white p-7 sm:p-8">
              <h3 className="text-2xl font-semibold tracking-tight">Submit your app</h3>
              <p className="mt-4 text-5xl font-semibold tracking-tight">Free</p>
              <p className="mt-4 flex-1 text-neutral-600">Add an app to Rocket for discovery. Claiming and verification follow the existing ownership checks.</p>
              <Link to="/submit" className="mt-7 inline-flex min-h-11 items-center justify-center rounded-xl bg-[#167ac6] px-5 text-sm font-semibold text-white hover:bg-[#1268aa]">Submit your app →</Link>
            </div>
          </div>
        </div>
      </section>

      {/* Create plans */}
      <section className="border-b border-neutral-200/60">
        <div className="mx-auto max-w-6xl px-6 py-16 text-center">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Create plans</h2>
          <p className="mx-auto mt-4 max-w-2xl text-neutral-600">Free gives you 500 one-time credits and no card. Starter renews 500 credits every month and adds PNG &amp; SVG downloads.</p>
          <div className="mt-8 inline-flex items-center rounded-full border border-neutral-200 bg-white p-1 text-sm">
            <button
              type="button"
              onClick={() => setBilling("monthly")}
              className={`rounded-full px-4 py-1.5 font-medium transition ${billing === "monthly" ? "bg-neutral-200 text-neutral-900" : "text-neutral-600 hover:text-neutral-900"}`}
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => setBilling("yearly")}
              className={`rounded-full px-4 py-1.5 font-medium transition ${billing === "yearly" ? "bg-neutral-200 text-neutral-900" : "text-neutral-600 hover:text-neutral-900"}`}
            >
              Yearly <span className={billing === "yearly" ? "text-neutral-600" : "text-brand"}>Save ~31%</span>
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
              <div className="text-sm font-semibold normal-case tracking-wider text-neutral-500">Starter</div>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="text-5xl font-semibold tracking-tight">{priceFor("starter").display}</span>
                <span className="text-sm text-neutral-500">{priceFor("starter").suffix}</span>
              </div>
              <p className="mt-2 text-sm text-neutral-600">For ongoing creation: 500 fresh credits every month, plus PNG &amp; SVG downloads.</p>
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
                {loading === productId("starter") ? <ControlLoader2 className="h-4 w-4 animate-spin" /> : "Start 7-day free trial"}
              </Button>
            </div>

            {/* Pro */}
            <div className="relative rounded-2xl border border-neutral-200 bg-neutral-100 p-8 text-neutral-900">
              <div className="absolute -top-3 right-6 rounded-full bg-brand px-3 py-1 text-xs font-semibold text-white">
                Most popular
              </div>
              <div className="text-sm font-semibold normal-case tracking-wider text-neutral-500">Pro</div>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="text-5xl font-semibold tracking-tight">{priceFor("growth").display}</span>
                <span className="text-neutral-500">{priceFor("growth").suffix}</span>
              </div>
              <p className="mt-2 text-sm text-neutral-600">For founders actively refining a brand and shipping launch assets.</p>
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
                {loading === productId("growth") ? <ControlLoader2 className="h-4 w-4 animate-spin" /> : "Upgrade to Pro"}
              </Button>
            </div>

            {/* Business */}
            <div className="relative rounded-2xl border border-neutral-200 bg-white p-8">
              <div className="text-sm font-semibold normal-case tracking-wider text-neutral-500">Business</div>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="text-5xl font-semibold tracking-tight">{priceFor("business").display}</span>
                <span className="text-sm text-neutral-500">{priceFor("business").suffix}</span>
              </div>
              <p className="mt-2 text-sm text-neutral-600">For teams and agencies generating across multiple brands.</p>
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
                {loading === productId("business") ? <ControlLoader2 className="h-4 w-4 animate-spin" /> : "Upgrade to Business"}
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
                className={`rounded-2xl border p-6 text-left transition hover:shadow-xs disabled:opacity-60 ${p.highlight ? "border-brand bg-brand/5 hover:bg-brand/10" : "border-neutral-200 bg-white hover:border-neutral-300"}`}
              >
                <div className="text-xs font-semibold normal-case tracking-wider text-neutral-500">{p.note}</div>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-4xl font-semibold tracking-tight">{p.price}</span>
                </div>
                <div className="mt-1 flex items-center gap-2 text-sm font-medium text-neutral-900">
                  {loading === p.id && <ControlLoader2 className="h-3.5 w-3.5 animate-spin" />}
                  {p.credits} credits
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section id="buy-with-rocket" className="scroll-mt-24 border-t border-neutral-200/60">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <div className="text-center">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Monetize plans</h2>
            <p className="mx-auto mt-4 max-w-2xl text-neutral-600">Rocket ID is free. Buy with Rocket takes a share only when an eligible connected app sells through Rocket.</p>
          </div>
          <div className="mt-10 grid gap-5 md:grid-cols-2">
            <div className="rounded-2xl border border-neutral-200 bg-white p-7 sm:p-8">
              <h3 className="text-2xl font-semibold tracking-tight">Buy with Rocket</h3>
              <div className="mt-4 flex items-baseline gap-2"><span className="text-5xl font-semibold tracking-tight">10%</span><span className="text-neutral-600">Rocket platform fee</span></div>
              <p className="mt-4 text-neutral-600">For payments processed through Buy with Rocket on an eligible, connected app. On a $100 purchase, Rocket's share is $10 and the app's share is $90 before Stripe processing fees and other applicable charges.</p>
              <p className="mt-5 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-700">Test-mode pilot only. Production purchases and general developer onboarding are not available yet.</p>
            </div>
            <div className="rounded-2xl border border-neutral-200 bg-white p-7 sm:p-8">
              <h3 className="text-2xl font-semibold tracking-tight">Rocket ID</h3>
              <div className="mt-4 flex items-baseline gap-2"><span className="text-5xl font-semibold tracking-tight">Free</span><span className="text-neutral-600">for identity</span></div>
              <p className="mt-4 text-neutral-600">Rocket ID lets a connected app offer Rocket sign-in. There is no Rocket subscription or revenue-share fee for using identity alone. The 10% fee applies only to purchases processed through Buy with Rocket.</p>
              <p className="mt-5 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-700">Integration is in a developer pilot. It is not available across every app listed on Rocket.</p>
            </div>
          </div>
          <p className="mt-5 text-sm text-neutral-500">Create credits and subscriptions are separate from the Buy with Rocket fee.</p>
        </div>
      </section>

      <section className="border-t border-neutral-200/60">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <div className="text-center">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Grow pricing</h2>
            <p className="mx-auto mt-4 max-w-2xl text-neutral-600">Launch, Post, and Media are separate products. Choose and pay on each product's own site.</p>
          </div>
          <div className="mt-10 flex flex-col gap-6">
            {GROW_PRODUCTS.map((product) => (
              <div key={product.name} className="rounded-2xl border border-neutral-200 bg-white p-7 sm:p-8">
                <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
                  <div className="flex flex-col items-start">
                    <h3 className="text-2xl font-semibold tracking-tight">{product.name}</h3>
                    <p className="mt-3 max-w-md text-sm leading-relaxed text-neutral-600">{product.description}</p>
                    <a href={product.href} target="_blank" rel="noopener noreferrer" className="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl border border-[#167ac6] px-5 text-sm font-semibold text-[#167ac6] hover:bg-neutral-50 dark:text-[#dcefff]">
                      View {product.name} pricing ↗
                    </a>
                  </div>
                  <ul className="space-y-3" aria-label={`${product.name} plans`}>
                    {product.plans.map((plan) => {
                      const [name, price] = plan.split(" · ");
                      return (
                        <li key={plan} className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl border border-neutral-200 bg-neutral-50 px-5 py-4">
                          <span className="font-semibold text-neutral-900">{name}</span>
                          {price && <span className="text-sm text-neutral-600">{price}</span>}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-5 text-center text-xs text-neutral-500">USD prices checked October 1, 2026. Plans and terms may change; confirm on each linked pricing page before purchasing.</p>
        </div>
      </section>

      {/* FAQ */}
      <section className="border-t border-neutral-200/60 bg-neutral-50/60">
        <div className="mx-auto max-w-3xl px-6 py-20">
          <div className="text-center">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Frequently asked</h2>
          </div>
          <Accordion type="multiple" defaultValue={FAQS.map((_, i) => `item-${i}`)} className="mt-10 w-full space-y-3">
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
          <p className="mx-auto mt-4 max-w-xl text-neutral-600">Try 500 credits free, once, with no card. Upgrade for monthly credits and export rights when you need them.</p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg" className="bg-brand text-white hover:bg-brand/90">
              <Link to={user ? "/logos" : "/signup"}>Start free</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to={user ? "/settings/billing" : "/signup?next=%2Fpricing%3Fbuy%3Dgrowth"}>Upgrade to Pro</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="border-t border-neutral-200/60">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <div className="text-center">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Community</h2>
            <p className="mx-auto mt-4 max-w-2xl text-neutral-600">Meet other vibe coders and share what you're building.</p>
          </div>
          <div className="mx-auto mt-10 flex max-w-xl flex-col rounded-2xl border border-neutral-200 bg-white p-7 sm:p-8">
            <h3 className="text-2xl font-semibold tracking-tight">Discord</h3>
            <p className="mt-4 text-5xl font-semibold tracking-tight">Free</p>
            <p className="mt-4 flex-1 text-neutral-600">Join the Rocket community, ask questions, and connect with other builders.</p>
            <a href="https://discord.gg/aSkXPHhTjJ" target="_blank" rel="noopener noreferrer" className="mt-7 inline-flex min-h-11 items-center justify-center rounded-xl border border-[#167ac6] px-5 text-sm font-semibold text-[#167ac6] hover:bg-neutral-50 dark:text-[#dcefff]">Join Discord ↗</a>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
};


export default Pricing;
