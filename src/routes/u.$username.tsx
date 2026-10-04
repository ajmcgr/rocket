import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { profileFromData, publicProfileColumns } from "@/lib/memberProfile";
import PublicMemberProfile from "@/pages/PublicMemberProfile";

export const Route = createFileRoute("/u/$username")({
  loader: async ({ params }) => {
    const username = params.username.toLowerCase();
    if (!/^[a-z0-9_]{2,30}$/.test(username)) return null;
    const { data, error } = await (supabase as any).from("member_public_profiles").select(publicProfileColumns).eq("username", username).maybeSingle();
    if (error) throw error;
    return data ? profileFromData(data) : null;
  },
  head: ({ loaderData }) => ({ meta: [{ title: loaderData ? `${loaderData.full_name || loaderData.username} | Rocket` : "Profile not found | Rocket" }] }),
  component: () => <PublicMemberProfile profile={Route.useLoaderData()} />,
  errorComponent: ({ reset }) => <main className="mx-auto max-w-3xl p-10"><h1 className="text-2xl font-semibold">Profile could not be loaded</h1><button onClick={reset} className="mt-4 underline">Try again</button></main>,
});
