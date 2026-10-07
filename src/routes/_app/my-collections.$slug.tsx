import { createFileRoute } from "@tanstack/react-router";
import CollectionDetail from "@/pages/CollectionDetail";
export const Route = createFileRoute("/_app/my-collections/$slug")({
  head: () => ({
    meta: [
      { title: "My Collection | Rocket" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: () => (
    <CollectionDetail
      key={Route.useParams().slug}
      slug={Route.useParams().slug}
      personal
    />
  ),
});
