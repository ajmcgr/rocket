import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/developer/")({
  component: lazyRouteComponent(() => import("@/pages/Developer")),
});
