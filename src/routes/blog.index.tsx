import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/blog/")({
  component: lazyRouteComponent(() => import("@/pages/Blog")),
});
