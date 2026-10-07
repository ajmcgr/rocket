import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/connect/authorize")({
  head: () => ({ meta: [
    { title: "Authorize an application | Rocket Connect" },
    { name: "description", content: "Review an application's requested access before connecting your Rocket account." },
    { property: "og:title", content: "Authorize an application | Rocket Connect" },
    { property: "og:description", content: "Review an application's requested access before connecting your Rocket account." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: lazyRouteComponent(() => import("@/pages/RocketConnectAuthorize")),
});
