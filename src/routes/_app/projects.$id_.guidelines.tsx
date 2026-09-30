import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/projects/$id_/guidelines")({
  component: lazyRouteComponent(() => import("@/pages/BrandGuidelines")),
});
