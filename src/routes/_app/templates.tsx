import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/templates")({
  component: lazyRouteComponent(() => import("@/pages/Templates")),
});
