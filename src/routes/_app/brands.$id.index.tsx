import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/brands/$id/")({
  component: lazyRouteComponent(() => import("@/pages/Brand")),
});
