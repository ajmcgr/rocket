import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/settings")({
  component: lazyRouteComponent(() => import("@/pages/Settings"), "SettingsLayout"),
});
