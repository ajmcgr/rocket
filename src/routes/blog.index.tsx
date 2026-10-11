import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/blog/")({
  head: () => ({
    meta: [
      { title: "Rocket Blog — Ideas for independent app builders" },
      { name: "description", content: "Practical ideas on launching, growing, monetizing, and branding independent software." },
    ],
    links: [{ rel: "canonical", href: "https://tryrocket.ai/blog" }],
  }),
  component: lazyRouteComponent(() => import("@/pages/Blog")),
});
