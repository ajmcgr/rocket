import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/deals/$dealId")({
  component: lazyRouteComponent(() => import("@/pages/DealRoom")),
});
