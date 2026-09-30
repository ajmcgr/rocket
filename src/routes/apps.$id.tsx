import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/apps/$id")({
  component: lazyRouteComponent(() => import("@/pages/PublicAppProfile")),
});
