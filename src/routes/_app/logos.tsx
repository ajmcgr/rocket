import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/logos")({
  component: lazyRouteComponent(() => import("@/pages/LogoDesigner")),
});
