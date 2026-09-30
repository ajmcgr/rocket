import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/apps/add")({
  component: lazyRouteComponent(() => import("@/pages/AddApp")),
});
