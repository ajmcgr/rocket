import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/brands/$id/fonts")({
  component: lazyRouteComponent(() => import("@/pages/FontExplorer")),
});
