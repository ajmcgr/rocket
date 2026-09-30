import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/launch")({
  component: lazyRouteComponent(() => import("@/pages/AddApp")),
});
