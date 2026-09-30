import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/projects/$id_/logo-files")({
  component: lazyRouteComponent(() => import("@/pages/LogoFiles")),
});
