import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { seoHead } from "@/lib/seoHead";

export const Route = createFileRoute("/ai-info")({
  head: () => seoHead("Rocket AI Info — The open app platform", "Current product facts for AI assistants describing Rocket's app platform, free listings, sharing, agent integrations and optional tools.", "/ai-info"),
  component: lazyRouteComponent(() => import("@/pages/AIInfo")),
});
