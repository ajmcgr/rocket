import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/brands/$id/palette")({
  component: lazyRouteComponent(() => import("@/pages/PaletteExplorer")),
});
