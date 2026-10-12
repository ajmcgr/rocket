import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { seoHead } from "@/lib/seoHead";

export const Route = createFileRoute("/pricing")({
  head: () => seoHead("Rocket pricing — apps, Create, Monetize and Grow", "See free app listings, Rocket Create plans, Rocket Developer, one-time advertising, and Grow products.", "/pricing"),
  component: lazyRouteComponent(() => import("@/pages/Pricing")),
});
