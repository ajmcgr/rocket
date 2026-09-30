import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/submit")({
  component: lazyRouteComponent(() => import("@/pages/LaunchPreview")),
});
