import { createFileRoute } from "@tanstack/react-router";
import SiteHeader from "@/components/SiteHeader";
import { seoHead } from "@/lib/seoHead";

export const Route = createFileRoute("/valuation-methodology")({
  head: () => seoHead("Sell My App valuation methodology | Rocket", "How Rocket estimates illustrative software business values and handles missing or unverified data.", "/valuation-methodology"),
  component: Methodology,
});

function Methodology() {
  return <div className="min-h-screen bg-[#f5f8fc] text-slate-900"><SiteHeader /><main className="mx-auto max-w-3xl px-5 py-12 sm:px-8">
    <a href="/sell" className="text-sm font-semibold text-sky-700">← Back to Sell My App</a>
    <h1 className="mt-6 text-4xl font-bold">Valuation methodology</h1>
    <p className="mt-4 text-slate-600">Model v1.0.0 · Illustrative estimates for independent software businesses. This is not a formal appraisal, buyer offer or guaranteed sale price.</p>
    <h2 className="mt-10 text-2xl font-bold">Basis</h2>
    <p className="mt-3 leading-7">When positive monthly profit is provided, the model annualizes it and applies a 3.0× starting profit multiple. This sits between Flippa’s reported 2.47× average SaaS annual profit multiple for H1 2026 and Acquire.com’s reported 3.9× median confirmed-sale profit multiple for 2024–2025. Those transaction populations differ; this is an illustrative anchor, not a market quote for your app.</p>
    <p className="mt-4 leading-7">When positive profit is unavailable but a recurring-revenue model has MRR or ARR, the model uses a cautious 1.5× annual recurring revenue starting point with a wider range and lower confidence. MRR is annualized as MRR × 12; if ARR is also provided, MRR takes precedence and the two values are never added. If neither basis is supported, the calculator returns “insufficient evidence” rather than inventing a dollar figure from traffic.</p>
    <h2 className="mt-10 text-2xl font-bold">Adjustments and range</h2>
    <p className="mt-3 leading-7">The selected multiple is adjusted once for reported monthly growth, operating history, churn, customer concentration, platform dependence, operational complexity and organic acquisition. The combined adjustment is capped at 55%–135% of the starting multiple. For profit-based results, low and high are 30% either side of the midpoint; for revenue-based results, 40%. These are uncertainty bands, not statistical confidence intervals. Visitor volume is context only and has no direct dollar coefficient.</p>
    <h2 className="mt-10 text-2xl font-bold">Data and confidence</h2>
    <p className="mt-3 leading-7">All figures entered in this calculator are manual and unverified. The selected currency is used throughout; no exchange conversion occurs. Confidence reflects the valuation basis, business age and the completeness of churn and concentration inputs. Existing Rocket provider connections are managed separately and do not automatically verify a calculation. Saved valuations are private to the account owner. Sharing starts with the estimated value and app name turned off.</p>
    <h2 className="mt-10 text-2xl font-bold">Sources</h2>
    <ul className="mt-3 list-disc space-y-2 pl-5 text-sky-700"><li><a className="underline" href="https://flippa.com/free-valuation/saas" target="_blank" rel="noreferrer">Flippa: SaaS valuation, H1 2026 transaction observations</a></li><li><a className="underline" href="https://blog.acquire.com/acquire-com-biannual-acquisition-multiples-report-jan-2026/" target="_blank" rel="noreferrer">Acquire.com: January 2026 acquisition multiples report</a></li></ul>
  </main></div>;
}
