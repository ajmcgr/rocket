import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/tools/$slug")({
  component: lazyRouteComponent(() => import("@/pages/ToolDetail")),
});
