// Pass a saved public profile, never an unverified auth metadata username.
export function myProfileHref(profile?: Record<string, unknown> | null) {
  const username = typeof profile?.username === "string" ? profile.username.trim().toLowerCase() : "";
  return /^[a-z0-9_]{2,30}$/.test(username) ? `/u/${username}` : "/settings/profile";
}
