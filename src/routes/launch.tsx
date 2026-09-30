import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/launch")({
  component: lazyRouteComponent(() => import("@/pages/LaunchPreview")),
});
