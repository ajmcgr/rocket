import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
export const Route = createFileRoute("/rocket-id")({
  head: () => ({ meta: [
    { title: "Rocket ID — Rocket" },
    { name: "description", content: "Connect your app to Rocket ID and let Rocket users sign in with one secure identity." },
  ] }),
  component: lazyRouteComponent(() => import("@/pages/Developer"), "RocketID"),
});
