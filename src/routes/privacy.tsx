import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy")({
  component: lazyRouteComponent(() => import("@/pages/Privacy")),
});
