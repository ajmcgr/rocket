import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { profileFromData, publicProfileColumns } from "@/lib/memberProfile";
import PublicMemberProfile from "@/pages/PublicMemberProfile";
import { shareCardUrl, shareCardVersion } from "@/lib/shareLinks";

export const Route = createFileRoute("/@{$username}")({
  beforeLoad: ({ params, location }) => {
    const username = params.username.toLowerCase();
    if (username !== params.username && /^[a-z0-9_]{2,30}$/.test(username)) {
      throw redirect({ href: `/@${username}${location.searchStr}${location.hash ? `#${location.hash}` : ""}`, statusCode: 301, replace: true });
    }
  },
  loader: async ({ params }) => {
    const username = params.username.toLowerCase();
    if (!/^[a-z0-9_]{2,30}$/.test(username)) return null;
    const { data, error } = await (supabase as any).from("member_public_profiles").select(publicProfileColumns).eq("username", username).maybeSingle();
    if (error) throw error;
    return data ? profileFromData(data) : null;
  },
  head: ({ loaderData }) => ({
    meta: loaderData ? [
      { title: `@${loaderData.username} | Rocket` },
      { name: "description", content: loaderData.bio || `Explore apps from @${loaderData.username} on Rocket.` },
      { property: "og:title", content: `@${loaderData.username} | Rocket` },
      { property: "og:description", content: loaderData.bio || `Explore apps from @${loaderData.username} on Rocket.` },
      { property: "og:url", content: `https://tryrocket.ai/@${loaderData.username}` },
      { property: "og:image", content: shareCardUrl("profile", loaderData.username, "landscape", shareCardVersion(loaderData.username, loaderData.bio, loaderData.avatar_url)) },
      { name: "twitter:card", content: "summary_large_image" },
    ] : [{ title: "Profile not found | Rocket" }, { name: "robots", content: "noindex" }],
    links: loaderData ? [{ rel: "canonical", href: `https://tryrocket.ai/@${loaderData.username}` }] : [],
  }),
  component: () => <PublicMemberProfile profile={Route.useLoaderData()} />,
  errorComponent: ({ reset }) => <main className="mx-auto max-w-3xl p-10"><h1 className="text-2xl font-semibold">Profile could not be loaded</h1><button onClick={reset} className="mt-4 underline">Try again</button></main>,
});
