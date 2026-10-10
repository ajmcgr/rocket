import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/my-apps/$id/")({
  head: () => ({ meta: [{ name: "robots", content: "noindex, nofollow" }] }),
  component: lazyRouteComponent(() => import("@/pages/MyAppSettings")),
});
