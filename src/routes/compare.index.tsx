import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/compare/")({
  component: lazyRouteComponent(() => import("@/pages/Compare")),
});
