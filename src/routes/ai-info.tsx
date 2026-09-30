import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/ai-info")({
  component: lazyRouteComponent(() => import("@/pages/AIInfo")),
});
