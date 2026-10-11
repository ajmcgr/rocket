import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { seoHead } from "@/lib/seoHead";

export const Route = createFileRoute("/pricing")({
  head: () => seoHead("Rocket pricing — apps, Create, Monetize and Grow", "See free app listings, Rocket Create plans, Rocket ID and Buy with Rocket pricing, plus Grow products.", "/pricing"),
  component: lazyRouteComponent(() => import("@/pages/Pricing")),
});
