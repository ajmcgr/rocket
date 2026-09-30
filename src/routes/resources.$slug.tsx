import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/resources/$slug")({
  component: lazyRouteComponent(() => import("@/pages/Resources"), "PillarPage"),
});
