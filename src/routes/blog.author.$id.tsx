import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/blog/author/$id")({
  component: lazyRouteComponent(() => import("@/pages/BlogAuthor")),
});
