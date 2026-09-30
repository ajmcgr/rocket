import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/faq")({
  component: lazyRouteComponent(() => import("@/pages/FAQ")),
});
