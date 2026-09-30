import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/settings/profile")({
  component: lazyRouteComponent(() => import("@/pages/Settings"), "ProfileSettings"),
});
