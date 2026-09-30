import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/wizard")({
  component: lazyRouteComponent(() => import("@/pages/LogoStudio")),
});
