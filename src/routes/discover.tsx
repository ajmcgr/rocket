import { createFileRoute, redirect } from "@tanstack/react-router";
import Discover from "@/pages/Discover";
import { APP_CATEGORIES } from "@/lib/appCategories";
import { supabase } from "@/integrations/supabase/client";

const discoverView = (value: unknown) =>
  typeof value === "string" && ["rankings", "new", "categories", "all"].includes(value) ? value : "all";

function DiscoverRoute() {
  const { categories, initialView } = Route.useLoaderData();
  return <Discover initialCategories={categories} initialView={initialView} />;
}

export const Route = createFileRoute("/discover")({
  beforeLoad: ({ location }) => {
    if (new URLSearchParams(location.searchStr).get("view") === "rising") {
      throw redirect({ to: "/rising", search: { page: 0 }, replace: true });
    }
  },
  validateSearch: (search: Record<string, unknown>) => search,
  loaderDeps: ({ search }) => ({ view: typeof search.view === "string" ? search.view : null }),
  loader: async ({ deps }) => {
    const { data, error } = await supabase.from("public_app_categories")
      .select("category,app_count").order("app_count", { ascending: false }).limit(100);
    if (error) throw error;
    return { categories: data || [], initialView: deps.view };
  },
  head: ({ match }) => {
    const search = match.search as Record<string, unknown>;
    const view = discoverView(search.view);
    const category = typeof search.category === "string" && APP_CATEGORIES.some((item) => item.name === search.category)
      ? search.category : "";
    const page = Math.max(0, Math.min(1000, Math.floor(Number(search.page) || 0)));
    const base = "https://tryrocket.ai/discover";
    const canonicalParams = new URLSearchParams();
    if (view !== "all" || category) canonicalParams.set("view", view);
    if (category && view !== "categories") canonicalParams.set("category", category);
    const filtered = ["q", "platform", "source", "pricing", "billing"].some((key) => Boolean(search[key]));
    if (page > 0 && view !== "categories" && !filtered) canonicalParams.set("page", String(page));
    const canonical = `${base}${canonicalParams.size ? `?${canonicalParams}` : ""}`;
    const title = category && view === "all" ? `${category} Apps | Rocket` :
      view === "rankings" ? "Top Ranked Apps | Rocket" :
      view === "new" ? "New Apps | Rocket" :
      view === "categories" ? "App Categories | Rocket" : "Discover Apps | Rocket";
    const description = category && view === "all"
      ? `Explore ${category} apps on Rocket. Compare listings and find software worth trying.`
      : view === "rankings" ? "Explore Rocket's top ranked apps by published reviews, bookmarks and verified purchases."
      : view === "new" ? "Find newly added apps on Rocket."
      : view === "categories" ? "Browse Rocket apps by category to find software for what you want to do."
      : "Discover apps worth using, including new software from vibe coders and developers.";
    return {
      meta: [{ title }, { name: "description", content: description }, { property: "og:title", content: title }, { property: "og:description", content: description }, { property: "og:url", content: canonical }],
      links: [{ rel: "canonical", href: canonical }],
    };
  },
  component: DiscoverRoute,
});
