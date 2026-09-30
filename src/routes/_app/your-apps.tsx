import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/your-apps")({
  component: lazyRouteComponent(() => import("@/pages/MyApps")),
});
