import { createFileRoute } from "@tanstack/react-router";
import { loadCuratedApps } from "@/lib/homeMerchandising";
import CuratedApps from "@/pages/CuratedApps";
export const Route = createFileRoute("/picks")({
  validateSearch: (s: Record<string, unknown>) => ({
    collection:
      typeof s.collection === "string" ? s.collection.slice(0, 160) : undefined,
  }),
  loaderDeps: ({ search }) => ({ collection: search.collection }),
  loader: async ({ deps }) => ({
    rows: await loadCuratedApps("picks", deps.collection),
    collection: deps.collection,
  }),
  head: ({ loaderData }) => ({
    meta: [
      {
        title: loaderData?.collection
          ? `${loaderData.collection} | Rocket Picks`
          : "Rocket Picks | Rocket",
      },
    ],
    links: [
      {
        rel: "canonical",
        href: `https://tryrocket.ai/picks${loaderData?.collection ? `?collection=${encodeURIComponent(loaderData.collection)}` : ""}`,
      },
    ],
  }),
  component: () => (
    <CuratedApps
      kind="picks"
      collection={Route.useSearch().collection}
      rows={Route.useLoaderData().rows}
    />
  ),
});
