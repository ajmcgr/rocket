import { createFileRoute, lazyRouteComponent, notFound } from "@tanstack/react-router";
import { getTool } from "@/content/tools";
import { seoHead } from "@/lib/seoHead";

const ToolDetail = lazyRouteComponent(() => import("@/pages/ToolDetail"));

export const Route = createFileRoute("/tools/$slug")({
  loader: ({ params }) => {
    if (!getTool(params.slug)) throw notFound();
  },
  head: ({ params }) => {
    const tool = getTool(params.slug);
    return tool ? seoHead(`${tool.name} — Free AI branding tool | Rocket`, tool.description, `/tools/${tool.slug}`)
      : { meta: [{ title: "Tool not found — Rocket" }, { name: "robots", content: "noindex" }] };
  },
  component: ToolDetail,
  notFoundComponent: ToolDetail,
});
