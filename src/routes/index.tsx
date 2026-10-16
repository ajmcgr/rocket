import { createFileRoute } from "@tanstack/react-router";
import Home from "@/pages/Home";
import { loadHomeMerchandising } from "@/lib/homeMerchandising";

export const Route = createFileRoute("/")({
  // Stream the hero immediately; public shelves must not block the page shell.
  loader: () => ({ merchandising: loadHomeMerchandising() }),
  head: () => ({
    meta: [
      { title: "Rocket — The open app platform" },
      {
        name: "description",
        content:
          "Discover apps. Grow and monetize yours.",
      },
    ],
    links: [{ rel: "canonical", href: "https://tryrocket.ai/" }],
  }),
  component: () => <Home data={Route.useLoaderData().merchandising} />,
});
