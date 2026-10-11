import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { seoHead } from "@/lib/seoHead";

export const Route = createFileRoute("/faq")({
  head: () => seoHead("Rocket FAQ — Discovery, app claims, verification, and accounts", "Answers about discovering and saving independent apps, launching and claiming an app, verification, Rocket integrations, creative tools, and billing.", "/faq"),
  component: lazyRouteComponent(() => import("@/pages/FAQ")),
});
