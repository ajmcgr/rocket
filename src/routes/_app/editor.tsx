import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/editor")({
  component: lazyRouteComponent(() => import("@/pages/Editor")),
});
