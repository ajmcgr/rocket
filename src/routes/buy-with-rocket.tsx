import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
export const Route = createFileRoute("/buy-with-rocket")({
  head: () => ({ meta: [
    { title: "Buy with Rocket — Rocket" },
    { name: "description", content: "Map eligible Stripe prices to app access with Buy with Rocket. Plans stay inactive until payment and entitlement integration is verified." },
  ] }),
  component: lazyRouteComponent(
    () => import("@/pages/Developer"),
    "BuyWithRocket",
  ),
});
