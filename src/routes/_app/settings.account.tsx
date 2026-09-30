import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/settings/account")({
  component: lazyRouteComponent(() => import("@/pages/Settings"), "AccountSettings"),
});
