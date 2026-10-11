import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { seoHead } from "@/lib/seoHead";

export const Route = createFileRoute("/compare/")({
  head: () => seoHead("Compare Rocket with other software marketplaces", "How Rocket's independent web-app discovery differs from the App Store, Google Play, Product Hunt, Whop, Gumroad, and G2.", "/compare"),
  component: lazyRouteComponent(() => import("@/pages/Compare")),
});
