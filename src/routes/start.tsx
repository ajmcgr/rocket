import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/start")({
  component: lazyRouteComponent(() => import("@/pages/StartHere")),
});
