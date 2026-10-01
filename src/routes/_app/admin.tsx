import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/admin")({
  component: lazyRouteComponent(() => import("@/pages/Admin")),
});
