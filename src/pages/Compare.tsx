import { Link } from "@/lib/router-compat";
import { ArrowRight } from "lucide-react";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import { marketplaceComparisons } from "@/content/marketplaceComparisons";
import { useDocumentMeta } from "@/hooks/useDocumentMeta";

export default function Compare() {
  useDocumentMeta({
    title: "Compare Rocket with other software marketplaces",
    description: "How Rocket's independent-app discovery differs from Product Hunt, Whop, Gumroad, and G2.",
    canonical: "https://tryrocket.ai/compare",
  });

  return (
    <div className="marketplace-page min-h-screen bg-[#f7f9fc] text-neutral-950">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-5 py-12 sm:px-8 sm:py-20">
        <p className="text-sm font-semibold text-sky-800">Compare</p>
        <h1 className="mt-3 max-w-3xl text-4xl font-bold tracking-tight sm:text-6xl">
          Different places for different kinds of software discovery.
        </h1>
        <p className="mt-5 max-w-2xl text-lg leading-relaxed text-neutral-600">
          Rocket helps you find and save independent web apps. Other platforms are stronger for launch-day conversation, digital-product checkout, or review-led B2B research. Choose the one that fits your job.
        </p>
        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {marketplaceComparisons.map((item) => (
            <Link key={item.slug} to={`/compare/${item.slug}`} className="group rounded-2xl border border-neutral-200 bg-white p-6 transition hover:border-sky-400 hover:shadow-sm">
              <p className="text-sm font-medium text-sky-800">{item.focus}</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight">Rocket and {item.name}</h2>
              <p className="mt-3 text-sm leading-relaxed text-neutral-600">{item.summary}</p>
              <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-sky-800">Read comparison <ArrowRight className="h-4 w-4" /></span>
            </Link>
          ))}
        </div>
        <p className="mt-8 max-w-3xl text-sm leading-relaxed text-neutral-500">
          These are product-positioning comparisons, not feature-parity or pricing claims. Rocket Login and Payments are available only for apps that have actually integrated them; an indexed app does not imply Rocket endorsement.
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
