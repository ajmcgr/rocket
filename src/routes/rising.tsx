import { createFileRoute } from "@tanstack/react-router";
import { loadCuratedApps } from "@/lib/homeMerchandising";
import CuratedApps from "@/pages/CuratedApps";
export const Route = createFileRoute("/rising")({
  loader: () => loadCuratedApps("rising"),
  head: () => ({
    meta: [
      { title: "Rising on Rocket | Rocket" },
      { name: "description", content: "Most viewed app pages on Rocket." },
    ],
    links: [{ rel: "canonical", href: "https://tryrocket.ai/rising" }],
  }),
  component: () => <CuratedApps kind="rising" rows={Route.useLoaderData()} />,
});
