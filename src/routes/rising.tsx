import { createFileRoute } from "@tanstack/react-router";
import { loadCuratedApps } from "@/lib/homeMerchandising";
import CuratedApps from "@/pages/CuratedApps";
export const Route = createFileRoute("/rising")({
  validateSearch: (search: Record<string, unknown>) => ({
    page: Math.max(0, Math.min(1000, Math.floor(Number(search.page) || 0))),
  }),
  loaderDeps: ({ search }) => ({ page: search.page }),
  loader: async ({ deps }) => {
    const rows = await loadCuratedApps("rising", undefined, deps.page * 20, 21);
    return { rows: rows.slice(0, 20), hasMore: rows.length > 20 };
  },
  head: () => ({
    meta: [
      { title: "Rising on Rocket | Rocket" },
      { name: "description", content: "Most viewed app pages on Rocket." },
    ],
    links: [{ rel: "canonical", href: "https://tryrocket.ai/rising" }],
  }),
  component: () => (
    <CuratedApps
      kind="rising"
      rows={Route.useLoaderData().rows}
      page={Route.useSearch().page}
      hasMore={Route.useLoaderData().hasMore}
    />
  ),
});
