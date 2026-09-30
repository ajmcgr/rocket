import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/gallery")({
  component: lazyRouteComponent(() => import("@/pages/Gallery")),
});
