import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/inbox")({
  component: lazyRouteComponent(() => import("@/pages/Inbox")),
});
