import { createFileRoute } from "@tanstack/react-router";
import CollectionDetail from "@/pages/CollectionDetail";
import { collectionApps, collectionDetail } from "@/lib/collections";

export const Route = createFileRoute("/collections/$slug")({
  staleTime: 0,
  gcTime: 0,
  shouldReload: true,
  loader: async ({ params }) => {
    if (!/^[a-z0-9-]{1,100}$/.test(params.slug))
      return { collection: null, apps: [] };
    const collection = await collectionDetail(params.slug);
    return {
      collection,
      apps: collection?.id ? await collectionApps(collection.id) : [],
    };
  },
  head: ({ loaderData }) => {
    const collection = loaderData?.collection;
    if (!collection)
      return {
        meta: [
          { title: "Collection not found | Rocket" },
          { name: "robots", content: "noindex, nofollow" },
        ],
      };
    const title = `${collection.name} | Rocket`;
    const description = `${collection.app_count} apps curated by ${collection.full_name || collection.username || "a Rocket member"}.`;
    const url = `https://tryrocket.ai/collections/${encodeURIComponent(collection.slug)}`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:url", content: url },
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },
  component: () => (
    <CollectionDetail
      key={Route.useParams().slug}
      slug={Route.useParams().slug}
      initial={Route.useLoaderData()}
    />
  ),
  errorComponent: ({ reset }) => (
    <main className="p-10">
      <h1>Collection could not be loaded</h1>
      <button onClick={reset}>Try again</button>
    </main>
  ),
});
