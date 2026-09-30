import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/create_/branding")({
  component: lazyRouteComponent(() => import("@/pages/Index")),
});
