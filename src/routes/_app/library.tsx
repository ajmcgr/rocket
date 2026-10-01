import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/library")({
  component: lazyRouteComponent(() => import("@/pages/Library")),
});
