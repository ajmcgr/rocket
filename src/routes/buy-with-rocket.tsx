import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
export const Route = createFileRoute("/buy-with-rocket")({
  head: () => ({ meta: [
    { title: "Buy with Rocket — Rocket" },
    { name: "description", content: "Sell access to your app with Buy with Rocket, connected payments and app entitlements." },
  ] }),
  component: lazyRouteComponent(
    () => import("@/pages/Developer"),
    "BuyWithRocket",
  ),
});
