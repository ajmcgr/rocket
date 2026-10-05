// The profile editor keeps the public username in user metadata after saving.
// Accounts without a username go to the editor instead of a broken public URL.
export function myProfileHref(metadata?: Record<string, unknown> | null) {
  const username = typeof metadata?.username === "string" ? metadata.username.trim().toLowerCase() : "";
  return /^[a-z0-9_]{2,30}$/.test(username) ? `/u/${username}` : "/settings/profile";
}
