import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/recap")({
  head: () => ({ meta: [{ title: "Rocket Recap | Rocket" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: lazyRouteComponent(() => import("@/pages/RocketRecap")),
});
