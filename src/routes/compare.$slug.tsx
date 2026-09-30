import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/compare/$slug")({
  component: lazyRouteComponent(() => import("@/pages/ComparisonDetail")),
});
