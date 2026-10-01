import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/outreach/unsubscribe")({
  component: lazyRouteComponent(() => import("@/pages/OutreachUnsubscribe")),
});
