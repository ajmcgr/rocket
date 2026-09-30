import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/resources/")({
  component: lazyRouteComponent(() => import("@/pages/Resources")),
});
