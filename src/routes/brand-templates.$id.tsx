import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/brand-templates/$id")({
  component: lazyRouteComponent(() => import("@/pages/BrandTemplates"), "BrandTemplateDetail"),
});
