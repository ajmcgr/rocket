import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/projects/$id_/palettes")({
  component: lazyRouteComponent(() => import("@/pages/PaletteExplorer")),
});
