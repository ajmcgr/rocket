import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/projects/$id_/brand-kit")({
  component: lazyRouteComponent(() => import("@/pages/BrandKit")),
});
