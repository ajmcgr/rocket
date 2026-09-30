import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/notifications")({
  component: lazyRouteComponent(() => import("@/pages/Notifications")),
});
