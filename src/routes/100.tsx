import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import Rocket100 from "@/pages/Rocket100";

export type Rocket100Builder = {
  username: string;
  name: string;
  avatar_url: string;
  founding_number: number;
  awarded_at: string;
  rank: number | null;
  score: number | null;
  popularity: number | null;
  app_count: number;
};
export type Rocket100Data = { participants: number; calculated_at: string | null; rows: Rocket100Builder[] };

export const Route = createFileRoute("/100")({
  loader: async (): Promise<Rocket100Data> => {
    const { data, error } = await (supabase as any).rpc("get_rocket100_leaderboard");
    if (error) throw error;
    return { participants: Number(data?.participants || 0), calculated_at: data?.calculated_at || null, rows: Array.isArray(data?.rows) ? data.rows : [] };
  },
  head: () => ({
    meta: [
      { title: "Rocket 100 — Founding Builders Leaderboard | Rocket" },
      { name: "description", content: "Discover the first 100 builders on Rocket, ranked by the popularity and number of apps they've built." },
      { property: "og:title", content: "Rocket 100 — Founding Builders Leaderboard" },
      { property: "og:description", content: "The first 100 builders shaping the open app platform." },
      { property: "og:url", content: "https://tryrocket.ai/100" },
    ],
    links: [{ rel: "canonical", href: "https://tryrocket.ai/100" }],
  }),
  component: Rocket100Route,
});

function Rocket100Route() {
  return <Rocket100 data={Route.useLoaderData()} />;
}
