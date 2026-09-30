import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/projects/$id_/social")({
  component: lazyRouteComponent(() => import("@/pages/SocialKit")),
});
