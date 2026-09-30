import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/my-apps/$id/edit")({
  component: lazyRouteComponent(() => import("@/pages/EditAppProfile")),
});
