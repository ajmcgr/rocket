import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/email/unsubscribe")({
  component: lazyRouteComponent(() => import("@/pages/WeekOneUnsubscribe")),
});
