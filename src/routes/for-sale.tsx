import { createFileRoute, redirect } from "@tanstack/react-router";

// Keep existing bookmarks and shared links working after the route rename.
export const Route = createFileRoute("/for-sale")({
  beforeLoad: ({ location }) => {
    throw redirect({
      href: `/marketplace${location.searchStr}${location.hash ? `#${location.hash}` : ""}`,
      statusCode: 301,
      replace: true,
    });
  },
});
