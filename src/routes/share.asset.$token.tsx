import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/share/asset/$token")({
  component: lazyRouteComponent(() => import("@/pages/SharedAsset")),
});
