import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { getPost } from "@/content/blogMeta";

export const Route = createFileRoute("/blog/$slug")({
  head: ({ params }) => {
    const post = getPost(params.slug);
    if (!post) return { meta: [{ title: "Article not found | Rocket" }, { name: "robots", content: "noindex" }] };
    const title = `${post.title} — Rocket Blog`;
    const canonical = `https://tryrocket.ai/blog/${post.slug}`;
    return {
      meta: [
        { title },
        { name: "description", content: post.excerpt },
        { property: "og:title", content: title },
        { property: "og:description", content: post.excerpt },
        { property: "og:url", content: canonical },
      ],
      links: [{ rel: "canonical", href: canonical }],
    };
  },
  component: lazyRouteComponent(() => import("@/pages/BlogPost")),
});
