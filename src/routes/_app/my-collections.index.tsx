import { createFileRoute } from "@tanstack/react-router";
import Collections from "@/pages/Collections";
export const Route = createFileRoute("/_app/my-collections/")({
  head: () => ({
    meta: [
      { title: "My Collections | Rocket" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: () => <Collections personal />,
});
