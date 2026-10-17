import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { seoHead } from "@/lib/seoHead";

export const Route = createFileRoute("/docs/")({
  head: () =>
    seoHead(
      "Rocket Docs — Guides for discovering and growing apps",
      "Detailed guides to app submissions, ownership, verified traffic and revenue, Rocket ID, Buy with Rocket, advertising and more.",
      "/docs",
    ),
  component: lazyRouteComponent(() => import("@/pages/Docs")),
});
