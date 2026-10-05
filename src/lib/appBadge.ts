export type BadgeTheme = "black" | "white";
export const badgePath = (theme: BadgeTheme) => `/badges/find-it-on-rocket-${theme}.svg`;
export const appBadgeUrl = (appId: string) => `https://tryrocket.ai/apps/${encodeURIComponent(appId)}`;
export function appBadgeEmbed(appId: string, theme: BadgeTheme) {
  return `<a href="${appBadgeUrl(appId)}" target="_blank" rel="noopener">
  <img src="https://tryrocket.ai${badgePath(theme)}" alt="Discover it on Rocket" width="220" height="68" style="display:block;max-width:100%;height:auto;" />
</a>`;
}
