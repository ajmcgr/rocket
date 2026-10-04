import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

// Preserve bookmarks and existing Stripe return URLs after splitting products
// from the signed-in Developer subscription settings.
export const Route = createFileRoute("/developer")({
  component: lazyRouteComponent(() => import("@/pages/DeveloperRedirect")),
});
