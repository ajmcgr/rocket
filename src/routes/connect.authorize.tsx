import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/connect/authorize")({
  component: lazyRouteComponent(() => import("@/pages/RocketConnectAuthorize")),
});
