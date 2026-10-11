import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { getPillar } from "@/content/blogMeta";
import { seoHead } from "@/lib/seoHead";

export const Route = createFileRoute("/resources/$slug")({
  head: ({ params }) => {
    const pillar = getPillar(params.slug);
    return pillar ? seoHead(`${pillar.title} — Rocket`, pillar.summary, `/resources/${pillar.slug}`)
      : { meta: [{ title: "Guide not found — Rocket" }, { name: "robots", content: "noindex" }] };
  },
  component: lazyRouteComponent(() => import("@/pages/Resources"), "PillarPage"),
});
