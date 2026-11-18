import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/deals/")({
  component: lazyRouteComponent(() => import("@/pages/Deals")),
});
