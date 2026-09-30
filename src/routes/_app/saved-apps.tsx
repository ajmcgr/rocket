import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/saved-apps")({
  component: lazyRouteComponent(() => import("@/pages/SavedApps")),
});
