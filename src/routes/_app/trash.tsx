import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/trash")({
  component: lazyRouteComponent(() => import("@/pages/Trash")),
});
