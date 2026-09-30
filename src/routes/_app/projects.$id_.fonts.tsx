import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/projects/$id_/fonts")({
  component: lazyRouteComponent(() => import("@/pages/FontExplorer")),
});
