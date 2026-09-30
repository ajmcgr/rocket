import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/icons")({
  component: lazyRouteComponent(() => import("@/pages/IconDesigner")),
});
