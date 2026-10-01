import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/claim-invitation")({
  component: lazyRouteComponent(() => import("@/pages/ClaimInvitation")),
});
