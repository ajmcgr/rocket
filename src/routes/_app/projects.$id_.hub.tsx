import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/projects/$id_/hub")({
  component: lazyRouteComponent(() => import("@/pages/BrandKitHub")),
});
