export type BadgeTheme = "black" | "white";
export const badgePath = (theme: BadgeTheme) => `/badges/find-it-on-rocket-${theme}.svg`;
export const appBadgeUrl = (appId: string, appSlug?: string | null) => `https://tryrocket.ai/apps/${encodeURIComponent(appSlug || appId)}`;
export function appBadgeEmbed(appId: string, theme: BadgeTheme, appSlug?: string | null) {
  return `<a href="${appBadgeUrl(appId, appSlug)}" target="_blank" rel="noopener">
  <img src="https://tryrocket.ai${badgePath(theme)}" alt="Discover it on Rocket" width="160" height="50" style="display:block;max-width:100%;height:auto;" />
</a>`;
}
