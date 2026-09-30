import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/brands/$id/brand-book")({
  component: lazyRouteComponent(() => import("@/pages/BrandGuidelines")),
});
