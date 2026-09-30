import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/invite/$token")({
  component: lazyRouteComponent(() => import("@/pages/AcceptInvite")),
});
