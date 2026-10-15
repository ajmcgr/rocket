import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { seoHead } from "@/lib/seoHead";

export const Route = createFileRoute("/brand-templates/")({
  head: () => seoHead(
    "Brand templates for startups and small teams — Rocket",
    "Explore practical brand templates for SaaS, ecommerce, agencies, fintech, creators and wellness brands.",
    "/brand-templates",
  ),
  component: lazyRouteComponent(() => import("@/pages/BrandTemplates"), "BrandTemplates"),
});
