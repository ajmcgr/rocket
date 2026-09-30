import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/settings/team")({
  component: lazyRouteComponent(() => import("@/pages/Team")),
});
