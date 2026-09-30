import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/brands/$id/social-icons")({
  component: lazyRouteComponent(() => import("@/pages/SocialIcons")),
});
