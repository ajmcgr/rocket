import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/stripe-revenue/install")({
  head: () => ({ meta: [{ name: "robots", content: "noindex, nofollow" }] }),
  component: lazyRouteComponent(() => import("@/pages/StripeRevenueInstall")),
});
