import { createFileRoute, lazyRouteComponent, notFound } from "@tanstack/react-router";
import { getTemplate, publicTemplates } from "@/data/templates";
import { seoHead } from "@/lib/seoHead";

const TemplateDetail = lazyRouteComponent(() => import("@/pages/BrandTemplates"), "BrandTemplateDetail");

export const Route = createFileRoute("/brand-templates/$id")({
  loader: ({ params }) => {
    const template = getTemplate(params.id);
    if (!template || !publicTemplates().some((item) => item.id === template.id)) throw notFound();
    return template;
  },
  head: ({ loaderData }) => loaderData
    ? seoHead(
        `${loaderData.name} Brand Template for ${loaderData.category} — Rocket`,
        `${loaderData.description} Explore its ${loaderData.tone.toLowerCase()} tone, palette and typography, then make it your own in Rocket.`,
        `/brand-templates/${loaderData.id}`,
      )
    : { meta: [{ title: "Brand template not found — Rocket" }, { name: "robots", content: "noindex" }] },
  component: TemplateDetail,
  notFoundComponent: TemplateDetail,
});
