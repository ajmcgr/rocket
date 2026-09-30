import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/create/chat")({
  component: lazyRouteComponent(() => import("@/pages/Generate")),
});
