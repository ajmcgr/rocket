import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/settings/notifications")({
  component: lazyRouteComponent(() => import("@/pages/Settings"), "NotificationsSettings"),
});
