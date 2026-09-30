import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/projects/$id")({
  component: lazyRouteComponent(() => import("@/pages/ProjectDetail")),
});
