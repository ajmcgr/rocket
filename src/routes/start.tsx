import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { seoHead } from "@/lib/seoHead";

export const Route = createFileRoute("/start")({
  head: () => seoHead("Start here — How Rocket works", "A practical guide to discovering independent apps and launching your own app on Rocket.", "/start"),
  component: lazyRouteComponent(() => import("@/pages/StartHere")),
});
