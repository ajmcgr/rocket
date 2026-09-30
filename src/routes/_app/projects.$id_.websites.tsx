import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/projects/$id_/websites")({
  component: lazyRouteComponent(() => import("@/pages/WebsiteTemplates")),
});
