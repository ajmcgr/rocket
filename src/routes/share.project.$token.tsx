import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/share/project/$token")({
  component: lazyRouteComponent(() => import("@/pages/SharedProject")),
});
