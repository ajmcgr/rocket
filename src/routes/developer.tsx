import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

// The product explanation is public. Setup and billing still use authenticated,
// owner/membership-checked APIs; private test-app routes remain under /_app.
export const Route = createFileRoute("/developer")({
  component: lazyRouteComponent(() => import("@/pages/Developer")),
});
