import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { getComparison } from "@/content/comparisons";
import { getMarketplaceComparison } from "@/content/marketplaceComparisons";
import { seoHead } from "@/lib/seoHead";

export const Route = createFileRoute("/compare/$slug")({
  head: ({ params }) => {
    const marketplace = getMarketplaceComparison(params.slug);
    if (marketplace) return seoHead(`Rocket vs ${marketplace.name} — Compare software discovery`, `Compare Rocket and ${marketplace.name} for finding independent software.`, `/compare/${marketplace.slug}`);
    const comparison = getComparison(params.slug);
    return comparison ? seoHead(`Rocket vs ${comparison.tool} — AI logo and brand tools compared`, `Compare Rocket with ${comparison.tool} for logos, icons, Brand Kits, editing and exports.`, `/compare/${comparison.slug}`)
      : { meta: [{ title: "Comparison not found — Rocket" }, { name: "robots", content: "noindex" }] };
  },
  component: lazyRouteComponent(() => import("@/pages/ComparisonDetail")),
});
