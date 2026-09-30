import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/brands/")({
  component: lazyRouteComponent(() => import("@/pages/BrandHub")),
});
