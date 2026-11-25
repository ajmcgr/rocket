import type { Tables } from "@/integrations/supabase/types";

type App = Tables<"public_apps">;

/** Keep the existing related-app selection consistent in SSR and the browser. */
export function selectSimilarApps(app: App, candidates: App[]): App[] {
  const tags = new Set(app.tags);
  return [...candidates]
    .sort((left, right) => {
      const score = (candidate: App) =>
        candidate.tags.filter((tag) => tags.has(tag)).length * 2 +
        candidate.platforms.filter((platform) => app.platforms.includes(platform)).length;
      return score(right) - score(left) || left.id.localeCompare(right.id);
    })
    .slice(0, 4);
}
