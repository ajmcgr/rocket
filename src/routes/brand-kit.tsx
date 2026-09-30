import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/brand-kit")({
  component: lazyRouteComponent(() => import("@/pages/MediaKit")),
});
