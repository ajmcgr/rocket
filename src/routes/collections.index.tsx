import { createFileRoute } from "@tanstack/react-router";
import Collections from "@/pages/Collections";
import { publicCollections } from "@/lib/collections";

export const Route = createFileRoute("/collections/")({
  staleTime: 0,
  gcTime: 0,
  shouldReload: true,
  loader: () => publicCollections(),
  head: () => ({
    meta: [
      { title: "Collections | Rocket" },
      {
        name: "description",
        content:
          "Discover independent software through community-curated app collections.",
      },
      { property: "og:title", content: "Collections | Rocket" },
    ],
    links: [{ rel: "canonical", href: "https://tryrocket.ai/collections" }],
  }),
  component: () => <Collections initial={Route.useLoaderData()} />,
  errorComponent: ({ reset }) => (
    <main className="p-10">
      <h1>Collections could not be loaded</h1>
      <button onClick={reset}>Try again</button>
    </main>
  ),
});
