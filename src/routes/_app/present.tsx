import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/present")({
  component: lazyRouteComponent(() => import("@/pages/Presenter")),
});
