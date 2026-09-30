import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/saved")({
  component: lazyRouteComponent(() => import("@/pages/SavedLogos")),
});
