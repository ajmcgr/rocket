import { ArrowUpRight, Loader2 as ControlLoader2 } from "lucide-react";
import { Link, useNavigate } from "@/lib/router-compat";
import { Check, Loader2 } from "@/components/EmojiIcons";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase as _sb } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import SiteHeader from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { useDocumentMeta } from "@/hooks/useDocumentMeta";
import { track } from "@/lib/analytics";
const supabase = _sb as any;

const STARTER_FEATURES = [
  "500 Rocket Credits each month",
  "Logo & Icon Designer",
  "Brand Kit essentials (view & share)",
  "Full template library",
];

const PRO_FEATURES = [
  "3,000 Rocket Credits each month",
  "Brand Kit ZIP downloads",
  "Brand Book PNG and PDF downloads",
];

const BUSINESS_FEATURES = [
  "Everything in Pro",
  "15,000 Rocket Credits each month",
];

const FAQS = [
  { q: "What can I use on Rocket for free?", a: "Browse and discover apps, save apps with a Rocket account, and submit, claim, manage, and verify your own app without a Developer membership. Personal workspaces remain free. Create has a free credit allowance; Launch, Post, and Media offer their own free plans." },
  { q: "Is there one subscription for every Rocket product?", a: "No. Create plans and credits, Rocket Developer, and the separate Launch, Post, and Media products have their own pricing. Buy only what you need; a subscription to one does not include the others." },
  { q: "Does submitting an app cost anything?", a: "App submission and basic listing management are free. Rocket ownership verification is separate from submission. Adding an app does not automatically activate Rocket ID or Buy with Rocket." },
  { q: "What does Rocket Developer cost?", a: "Rocket Developer is $99 per year per developer account, not per app. It brings app growth tools together: Verified Traction, Advanced Analytics, AI App Optimization, Beta Testing, Rocket ID, and Buy with Rocket. Some tools are in rollout. App submission, claiming, basic management, and verification remain free." },
  { q: "What is Rocket ID?", a: "Rocket ID lets users sign into an integrated app with their Rocket account. It requires an active Developer membership, verified ownership, and a configured and tested integration. Listing your app alone does not enable Rocket ID." },
  { q: "What is Buy with Rocket?", a: "Buy with Rocket lets eligible apps offer payment and verified access through Rocket. Live checkout is enabled, but a Buy option appears only for an offer that has passed its app-specific setup and readiness checks. It is not available on every listing." },
  { q: "What is the Buy with Rocket take rate?", a: "Rocket takes a 5% platform fee on payments through new Buy with Rocket plans. This transaction fee is separate from the $99/year Rocket Developer membership. Stripe processing fees and any other applicable charges are additional." },
  { q: "Are Stripe fees included in Rocket's 5%?", a: "No. Rocket's platform fee is separate from Stripe processing fees and any other applicable charges. A $100 purchase leaves $95 for the app before those separate costs." },
  { q: "Do teammates need their own Developer subscription?", a: "The workspace owner's active Rocket Developer membership covers shared workspaces and invited teammates. It does not grant teammates ownership of another developer's app or automatically activate payments or identity integrations." },
  { q: "What do Create plans cover?", a: "Create plans cover Rocket's logo, icon, and Brand Kit tools. Paid plans refresh or raise your monthly credit allowance; Pro also adds Brand Kit ZIP and Brand Book downloads. They are separate from Rocket Developer and the Grow products." },
  { q: "What is a Rocket Credit?", a: "Credits power everything you generate. Free includes 500 credits; Starter includes 500/month, Pro 3,000/month, and Business 15,000/month. One-time credit packs never expire." },
  { q: "How is Free different from Starter?", a: "Free includes 500 one-time credits and no card. Starter renews 500 credits every month, so you can keep generating without buying a credit pack." },
  { q: "What do I get when I upgrade to Pro?", a: "Pro includes 3,000 credits/month, Brand Kit ZIP downloads, and Brand Book PNG and PDF downloads. Shared workspaces are included separately with Rocket Developer ($99/year)." },
  { q: "Where do I manage or cancel my subscriptions?", a: "Manage Create billing in Settings → Billing and Rocket Developer membership in Settings → Developer. Manage Launch, Post, and Media billing on each product's own site. Purchases of third-party apps through Buy with Rocket are separate and can be managed from your Library where supported. Check the relevant subscription's billing period and cancellation terms." },
  { q: "Do credits roll over?", a: "Plan credits refresh each month. One-time credit packs never expire and stack on top of your plan." },
  { q: "What does Launch help me do?", a: "Launch has its own product listing and promotion tools. See Launch for current plan details and availability; a free Rocket app listing is separate from a paid Launch purchase." },
  { q: "What does Post help me do?", a: "Post helps you draft, schedule, and publish updates across connected social channels from one calendar. Its Free and Pro plans have different account connections and publishing limits. Subscribe and manage your plan on trypost.ai, separately from Rocket Developer." },
  { q: "What does Media help me do?", a: "Media is a separate product for finding contacts and organizing outreach. See Media for current features, pricing, and availability." },
  { q: "Are there trials for the Grow products?", a: "Launch, Post, and Media set their own trial and billing terms. Check each product's pricing page for current offers." },
  { q: "Does joining the community require a paid plan?", a: "No Rocket paid plan is required to follow the community link and meet other builders on Discord. Community participation does not include paid product subscriptions." },
];

type GrowPlan = {
  name: string;
  tagline: string;
  price: string;
  suffix: string | null;
  badge?: string;
  cta: string;
  features: string[];
  note?: string;
};

const GROW_PRODUCTS: { name: string; description: string; href: string; footnote: string; plans: GrowPlan[] }[] = [
  {
    name: "Launch",
    description: "Give your app a Launch product page and explore its separate promotion options.",
    href: "https://trylaunch.ai/pricing",
    footnote: "See Launch for current features, availability, and terms.",
    plans: [
      {
        name: "Free", tagline: "Basic listing", price: "$0", suffix: "one-time", cta: "Start free",
        features: ["Launch product listing", "See Launch for current features"],
      },
      {
        name: "Pro", tagline: "Full promotion", price: "$39", suffix: "per launch", badge: "Most popular", cta: "Get started",
        features: ["Launch promotion options", "See Launch for current features and eligibility"],
      },
      {
        name: "Grow", tagline: "Pro + directory submissions", price: "$199", suffix: "per launch", badge: "Most impact", cta: "Get started",
        features: ["Additional Launch promotion options", "See Launch for current features and eligibility"],
      },
      {
        name: "Pass", tagline: "Unlimited launches", price: "$99", suffix: "/ year", badge: "Best value", cta: "Get Pass",
        features: ["Launch Pass options", "See Launch for current features and eligibility"],
      },
    ],
  },
  {
    name: "Post",
    description: "Plan and publish social updates with Post, a separate product.",
    href: "https://trypost.ai/pricing",
    footnote: "See Post for current features, availability, and billing terms.",
    plans: [
      {
        name: "Free", tagline: "Everything you need to publish your first campaigns.", price: "$0", suffix: "/month", cta: "Get started",
        features: ["Social publishing tools", "See Post for current features"],
      },
      {
        name: "Pro", tagline: "For regular publishing.", price: "$19", suffix: "/month", badge: "Most popular", cta: "View plan",
        features: ["Post publishing options", "See Post for current features and eligibility"],
      },
    ],
  },
  {
    name: "Media",
    description: "Find contacts and organize outreach with Media, a separate product.",
    href: "https://trymedia.ai/pricing",
    footnote: "See Media for current features, availability, and billing terms.",
    plans: [
      {
        name: "Free", tagline: "Try Media AI search.", price: "$0", suffix: "/month", cta: "Start free",
        features: ["Explore Media", "See Media for current features"],
      },
      {
        name: "Starter", tagline: "Media search.", price: "$29", suffix: "/month", cta: "View plan",
        features: ["Media search options", "See Media for current features and eligibility"],
      },
      {
        name: "Growth", tagline: "For larger outreach workflows.", price: "$99", suffix: "/month", badge: "Most popular", cta: "View plan",
        features: ["Media growth options", "See Media for current features and eligibility"],
      },
    ],
  },
];

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

      <main>
      <div className="mx-auto max-w-6xl px-6 pt-20 pb-10 sm:pt-24">
          <h1 className="text-4xl font-semibold tracking-tight sm:text-6xl">Rocket pricing</h1>
          <p className="mt-5 max-w-2xl text-lg text-neutral-600">Submit and manage your apps for free. Create, monetize, and grow with the products that fit your work.</p>
      </div>

      <section className="border-b border-neutral-200/60">
        <div className="mx-auto max-w-6xl px-6 pb-20 text-center">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">My apps</h2>
          <p className="mx-auto mt-4 max-w-2xl text-neutral-600">Your Rocket listing and app workspace are free.</p>
          <div className="mt-10 grid gap-5 text-left md:grid-cols-2">
            <div className="flex flex-col rounded-2xl border border-neutral-200 bg-white p-7 sm:p-8">
              <h3 className="text-2xl font-semibold tracking-tight">My Apps</h3>
              <p className="mt-4 text-5xl font-semibold tracking-tight">Free</p>
              <p className="mt-4 flex-1 text-neutral-600">See apps you own or claim, improve public profiles, and manage available trust connections.</p>
              <Link to="/your-apps" className="mt-7 inline-flex min-h-11 items-center justify-center rounded-xl border border-[#167ac6] px-5 text-sm font-semibold text-[#167ac6] hover:bg-neutral-50 dark:text-[#dcefff]">Open My Apps →</Link>
            </div>
            <div className="flex flex-col rounded-2xl border border-neutral-200 bg-white p-7 sm:p-8">
              <h3 className="text-2xl font-semibold tracking-tight">Submit my app</h3>
              <p className="mt-4 text-5xl font-semibold tracking-tight">Free</p>
              <p className="mt-4 flex-1 text-neutral-600">Add an app to Rocket for discovery. Claiming and verification follow the existing ownership checks.</p>
              <Link to="/submit" className="mt-7 inline-flex min-h-11 items-center justify-center rounded-xl bg-[#167ac6] px-5 text-sm font-semibold text-white hover:bg-[#1268aa]">Submit my app →</Link>
            </div>
          </div>
        </div>
      </section>

      <section id="buy-with-rocket" className="scroll-mt-24 border-t border-neutral-200/60">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <div className="text-center">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Monetize plans</h2>
            <p className="mx-auto mt-4 max-w-2xl text-neutral-600">Submit, claim, manage, and verify your apps for free. Rocket Developer is the account-level membership for monetization.</p>
          </div>
          <div className="mx-auto mt-10 max-w-3xl rounded-2xl border border-neutral-200 bg-white p-7 sm:p-8">
            <h3 className="text-2xl font-semibold tracking-tight">Rocket Developer</h3>
            <div className="mt-4 flex items-baseline gap-2"><span className="text-5xl font-semibold tracking-tight">$99</span><span className="text-neutral-600">/ year, billed annually</span></div>
            <p className="mt-4 text-neutral-600">Build trust, understand your audience, improve your app, and connect ready offers. One membership covers the apps you legitimately own.</p>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-neutral-200 p-4"><h4 className="font-semibold">Verified Traction</h4><p className="mt-2 text-sm text-neutral-600">Connect supported evidence for your app. Basic verification remains free.</p></div>
              <div className="rounded-xl border border-neutral-200 p-4"><h4 className="font-semibold">Advanced Analytics <span className="text-xs font-medium text-neutral-500">· In rollout</span></h4><p className="mt-2 text-sm text-neutral-600">Explore deeper app performance insights as access rolls out.</p></div>
              <div className="rounded-xl border border-neutral-200 p-4"><h4 className="font-semibold">AI App Optimization <span className="text-xs font-medium text-neutral-500">· In rollout</span></h4><p className="mt-2 text-sm text-neutral-600">Get help improving how your app is presented.</p></div>
              <div className="rounded-xl border border-neutral-200 p-4"><h4 className="font-semibold">Beta Testing <span className="text-xs font-medium text-neutral-500">· In rollout</span></h4><p className="mt-2 text-sm text-neutral-600">Prepare to gather feedback from testers.</p></div>
              <div className="rounded-xl border border-neutral-200 p-4"><h4 className="font-semibold">Rocket ID</h4><p className="mt-2 text-sm text-neutral-600">Let Rocket users sign into an app you have integrated.</p></div>
              <div className="rounded-xl border border-neutral-200 p-4"><h4 className="font-semibold">Buy with Rocket</h4><p className="mt-2 text-sm text-neutral-600">Offer Rocket checkout on individually configured, ready offers. Rocket's fee is 5% per payment; Stripe processing fees are separate.</p></div>
            </div>
            <p className="mt-5 text-sm text-neutral-600">Live checkout is enabled for offers that pass their app-specific readiness checks. It is not available on every listing.</p>
            <Link to="/settings/developer" className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-[#167ac6] px-5 text-sm font-semibold text-white">Join Rocket Developer →</Link>
          </div>
          <p className="mt-5 text-sm text-neutral-500">Rocket Developer is separate from Create subscriptions and credits. New Buy with Rocket purchases carry a 5% Rocket platform fee, plus separate Stripe processing fees.</p>
        </div>
      </section>


      {/* Create plans */}
      <section className="border-b border-neutral-200/60">
        <div className="mx-auto max-w-6xl px-6 py-16 text-center">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Create plans</h2>
          <p className="mx-auto mt-4 max-w-2xl text-neutral-600">Free gives you 500 one-time credits and no card. Starter renews 500 credits every month.</p>
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
              <p className="mt-2 text-sm text-neutral-600">For ongoing creation: 500 fresh credits every month.</p>
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
              <p className="mt-2 text-sm text-neutral-600">For higher-volume generation across multiple brands.</p>
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


      <section className="border-t border-neutral-200/60">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <div className="text-center">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Grow pricing</h2>
            <p className="mx-auto mt-4 max-w-2xl text-neutral-600">Launch, Post, and Media are separate products. Choose and pay on each product's own site.</p>
          </div>
          <div className="mt-10 flex flex-col gap-10">
            {GROW_PRODUCTS.map((product) => (
              <div key={product.name}>
                <div className="space-y-3">
                  <h3 className="text-xl font-semibold tracking-tight">{product.name}</h3>
                  <p className="max-w-3xl text-base leading-relaxed text-neutral-600">{product.description}</p>
                </div>
                  <div className={`mt-4 grid gap-4 ${product.plans.length === 3 ? "sm:grid-cols-2 xl:grid-cols-3" : product.plans.length > 3 ? "sm:grid-cols-2 2xl:grid-cols-4" : "sm:grid-cols-2"}`}>
                    {product.plans.map((plan) => (
                      <div key={plan.name} className="flex flex-col rounded-2xl border border-neutral-200 bg-white p-6 sm:p-7">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="text-xl font-semibold tracking-tight">{plan.name}</h4>
                          {plan.badge && <span className="rounded-full border border-[#167ac6] px-2.5 py-0.5 text-xs font-semibold text-[#167ac6] dark:text-[#dcefff]">{plan.badge}</span>}
                        </div>
                        <p className="mt-1 text-sm text-neutral-600">{plan.tagline}</p>
                        <div className="mt-4 flex items-baseline gap-2">
                          <span className="text-4xl font-semibold tracking-tight">{plan.price}</span>
                          {plan.suffix && <span className="text-sm text-neutral-600">{plan.suffix}</span>}
                        </div>
                        <ul className="mt-5 space-y-2.5 text-sm text-neutral-700">
                          {plan.features.map((f) => (
                            <li key={f} className="flex gap-2.5">
                              <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#167ac6]" />
                              <span>{f}</span>
                            </li>
                          ))}
                        </ul>
                        {plan.note && <p className="mt-4 text-xs leading-relaxed text-neutral-500">{plan.note}</p>}
                        <div className="mt-auto pt-6">
                          <a href={product.href} target="_blank" rel="noopener noreferrer" aria-label={`${plan.cta} on ${product.name} (opens in a new tab)`} className="inline-flex min-h-11 w-full items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-[#167ac6] px-3 py-3 text-center text-sm font-semibold leading-5 text-white hover:bg-[#1268aa]">
                            <span>{plan.cta}</span>
                            <ArrowUpRight aria-hidden="true" className="h-4 w-4 shrink-0" />
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                <p className="mt-3 text-xs text-neutral-500">{product.footnote}</p>
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
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Frequently asked questions</h2>
          </div>
          <div className="mt-10 w-full space-y-3">
            {FAQS.map((f, i) => (
              <article key={i} className="rounded-2xl border border-neutral-200 bg-white px-6 py-5 dark:border-neutral-800 dark:bg-neutral-900">
                <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">{f.q}</h3>
                <p className="mt-3 text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">{f.a}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="border-t border-neutral-200/60">
        <div className="mx-auto max-w-4xl px-6 py-24 text-center">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-5xl">Build, launch, and grow with Rocket</h2>
          <p className="mx-auto mt-4 max-w-xl text-neutral-600">Discover useful apps, submit your own for free, and choose the tools you need to create, monetize, and grow.</p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg" className="bg-brand text-white hover:bg-brand/90">
              <Link to="/submit">Submit my app</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/discover">Explore apps</Link>
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

      </main>

    </div>
  );
};


export default Pricing;
