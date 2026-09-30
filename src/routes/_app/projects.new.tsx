import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/projects/new")({
  component: lazyRouteComponent(() => import("@/pages/ProjectWizard")),
});
