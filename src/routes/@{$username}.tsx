import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { profileFromData, publicProfileColumns } from "@/lib/memberProfile";
import PublicMemberProfile from "@/pages/PublicMemberProfile";
import { shareCardUrl, shareCardVersion } from "@/lib/shareLinks";
import type { Rocket100Builder } from "@/routes/100";

export const Route = createFileRoute("/@{$username}")({
  beforeLoad: ({ params, location }) => {
    const username = params.username.toLowerCase();
    if (username !== params.username && /^[a-z0-9_]{2,30}$/.test(username)) {
      throw redirect({ href: `/@${username}${location.searchStr}${location.hash ? `#${location.hash}` : ""}`, statusCode: 301, replace: true });
    }
  },
  loader: async ({ params }) => {
    const username = params.username.toLowerCase();
    if (!/^[a-z0-9_]{2,30}$/.test(username)) return { profile: null, rocket100: null };
    const { data, error } = await (supabase as any).from("member_public_profiles").select(publicProfileColumns).eq("username", username).maybeSingle();
    if (error) throw error;
    if (!data) return { profile: null, rocket100: null };
    const result = await (supabase as any).rpc("get_rocket100_leaderboard");
    const rocket100 = !result.error && Array.isArray(result.data?.rows)
      ? (result.data.rows as Rocket100Builder[]).find((row) => row.username === username) || null : null;
    return { profile: profileFromData(data), rocket100 };
  },
  head: ({ loaderData }) => ({
    meta: loaderData?.profile ? [
      { title: `@${loaderData.profile.username} | Rocket` },
      { name: "description", content: loaderData.profile.bio || `Explore apps from @${loaderData.profile.username} on Rocket.` },
      { property: "og:title", content: `@${loaderData.profile.username} | Rocket` },
      { property: "og:description", content: loaderData.profile.bio || `Explore apps from @${loaderData.profile.username} on Rocket.` },
      { property: "og:url", content: `https://tryrocket.ai/@${loaderData.profile.username}` },
      { property: "og:image", content: shareCardUrl(loaderData.rocket100 ? "rocket100" : "profile", loaderData.profile.username, "landscape", shareCardVersion("builder-copy", loaderData.profile.username, loaderData.profile.bio, loaderData.profile.avatar_url, loaderData.rocket100?.rank, loaderData.rocket100?.founding_number)) },
      { name: "twitter:card", content: "summary_large_image" },
    ] : [{ title: "Profile not found | Rocket" }, { name: "robots", content: "noindex" }],
    links: loaderData?.profile ? [{ rel: "canonical", href: `https://tryrocket.ai/@${loaderData.profile.username}` }] : [],
  }),
  component: PublicMemberProfileRoute,
  errorComponent: ({ reset }) => <main className="mx-auto max-w-3xl p-10"><h1 className="text-2xl font-semibold">Profile could not be loaded</h1><button onClick={reset} className="mt-4 underline">Try again</button></main>,
});

function PublicMemberProfileRoute() {
  const { profile } = Route.useLoaderData();
  return <PublicMemberProfile profile={profile} />;
}
