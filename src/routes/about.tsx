import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { seoHead } from "@/lib/seoHead";

export const Route = createFileRoute("/about")({
  head: () => seoHead("About Rocket — The open app platform", "Discover apps, build your developer reputation, and learn why Rocket helps useful software find its audience.", "/about"),
  component: lazyRouteComponent(() => import("@/pages/About")),
});
