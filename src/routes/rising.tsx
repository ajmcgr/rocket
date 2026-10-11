import { createFileRoute } from "@tanstack/react-router";
import { loadCuratedApps } from "@/lib/homeMerchandising";
import CuratedApps from "@/pages/CuratedApps";
export const Route = createFileRoute("/rising")({
  validateSearch: (search: Record<string, unknown>): { page?: number } => {
    const page = Math.max(0, Math.min(1000, Math.floor(Number(search.page) || 0)));
    return page > 0 ? { page } : {};
  },
  loaderDeps: ({ search }) => ({ page: search.page || 0 }),
  loader: async ({ deps }) => {
    const rows = await loadCuratedApps("rising", undefined, deps.page * 20, 21);
    return { rows: rows.slice(0, 20), hasMore: rows.length > 20 };
  },
  head: ({ match }) => ({
    meta: [
      { title: "Rising on Rocket | Rocket" },
      { name: "description", content: "Most viewed app pages on Rocket." },
    ],
    links: [{ rel: "canonical", href: `https://tryrocket.ai/rising${match.search.page ? `?page=${match.search.page}` : ""}` }],
  }),
  component: () => (
    <CuratedApps
      kind="rising"
      rows={Route.useLoaderData().rows}
      page={Route.useSearch().page || 0}
      hasMore={Route.useLoaderData().hasMore}
    />
  ),
});
