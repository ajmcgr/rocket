import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { getTool } from "@/content/tools";
import { seoHead } from "@/lib/seoHead";

export const Route = createFileRoute("/tools/$slug")({
  head: ({ params }) => {
    const tool = getTool(params.slug);
    return tool ? seoHead(`${tool.name} — Free AI branding tool | Rocket`, tool.description, `/tools/${tool.slug}`)
      : { meta: [{ title: "Tool not found — Rocket" }, { name: "robots", content: "noindex" }] };
  },
  component: lazyRouteComponent(() => import("@/pages/ToolDetail")),
});
