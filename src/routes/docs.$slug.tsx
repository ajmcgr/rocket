import { createFileRoute, notFound } from "@tanstack/react-router";
import { getDoc } from "@/content/rocketDocs";
import { seoHead } from "@/lib/seoHead";
import Docs from "@/pages/Docs";

export const Route = createFileRoute("/docs/$slug")({
  loader: ({ params }) => {
    const article = getDoc(params.slug);
    if (!article) throw notFound();
    return { article };
  },
  head: ({ loaderData }) =>
    loaderData
      ? seoHead(
          `${loaderData.article.title} — Rocket Docs`,
          loaderData.article.summary,
          `/docs/${loaderData.article.slug}`,
        )
      : {
          meta: [
            { title: "Guide not found — Rocket Docs" },
            { name: "robots", content: "noindex" },
          ],
        },
  component: DocPage,
});

function DocPage() {
  const { article } = Route.useLoaderData();
  return <Docs key={article.slug} article={article} />;
}
