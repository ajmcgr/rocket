import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/my-apps/$id/revenue")({
  component: lazyRouteComponent(() => import("@/pages/AppRevenue")),
});
