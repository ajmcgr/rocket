import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/my-apps/$id/rocket-analytics")({
  component: lazyRouteComponent(() => import("@/pages/RocketAppAnalytics")),
});
