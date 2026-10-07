import { createFileRoute, redirect } from "@tanstack/react-router";
import PublicMemberProfile from "@/pages/PublicMemberProfile";

// Preserve existing bookmarks and shared links without a second profile lookup.
export const Route = createFileRoute("/u/$username")({
  beforeLoad: ({ params, location }) => {
    const username = params.username.toLowerCase();
    if (!/^[a-z0-9_]{2,30}$/.test(username)) return;
    throw redirect({
      href: `/@${username}${location.searchStr}${location.hash ? `#${location.hash}` : ""}`,
      statusCode: 301,
      replace: true,
    });
  },
  head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
  component: () => <PublicMemberProfile profile={null} />,
});
