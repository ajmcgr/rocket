import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/insights")({
  component: lazyRouteComponent(() => import("@/pages/Insights")),
});
