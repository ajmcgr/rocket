import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/blog/$slug")({
  component: lazyRouteComponent(() => import("@/pages/BlogPost")),
});
