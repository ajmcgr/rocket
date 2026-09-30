import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/settings/billing")({
  component: lazyRouteComponent(() => import("@/pages/Settings"), "BillingSettings"),
});
