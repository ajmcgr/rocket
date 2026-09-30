import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/create/")({
  component: lazyRouteComponent(() => import("@/pages/CreateEntry")),
});
