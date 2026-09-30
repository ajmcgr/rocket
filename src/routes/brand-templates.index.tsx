import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/brand-templates/")({
  component: lazyRouteComponent(() => import("@/pages/BrandTemplates"), "BrandTemplates"),
});
