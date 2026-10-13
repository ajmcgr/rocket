import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { seoHead } from "@/lib/seoHead";

export const Route = createFileRoute("/faq")({
  head: () => seoHead("Rocket FAQ — Discovery, app claims, verification, and accounts", "Answers about discovering and sharing apps, app claims, AI agent integrations, provider visibility, advertising, and billing.", "/faq"),
  component: lazyRouteComponent(() => import("@/pages/FAQ")),
});
