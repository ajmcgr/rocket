import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/advertise")({
  component: lazyRouteComponent(() => import("@/pages/Advertise")),
});
