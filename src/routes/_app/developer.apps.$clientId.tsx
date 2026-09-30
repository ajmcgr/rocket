import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/developer/apps/$clientId")({
  component: lazyRouteComponent(() => import("@/pages/Developer"), "DeveloperAppDetail"),
});
