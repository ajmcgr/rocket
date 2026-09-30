import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/my-apps/$id/analytics")({
  component: lazyRouteComponent(() => import("@/pages/AppAnalytics")),
});
