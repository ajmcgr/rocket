export const publicProfileColumns = "username,full_name,bio,avatar_url,banner_url,website,x_username,instagram_username,linkedin_username,youtube_channel,telegram_username";
export const profileFields = [
  ["full_name", "Full name", 100], ["bio", "Bio", 1000],
  ["x_username", "X username", 100], ["instagram_username", "Instagram username", 100],
  ["linkedin_username", "LinkedIn username", 100], ["youtube_channel", "YouTube channel", 100],
  ["telegram_username", "Telegram username", 100], ["website", "Website", 2048],
] as const;
export type MemberProfile = Record<(typeof profileFields)[number][0] | "username" | "avatar_url" | "banner_url", string>;
export function profileFromData(data: any = {}): MemberProfile {
  return Object.fromEntries(["username", "avatar_url", "banner_url", ...profileFields.map(([key]) => key)].map(key => [key, typeof data[key] === "string" ? data[key] : ""])) as MemberProfile;
}
export function normalizeProfile(input: MemberProfile): MemberProfile {
  const result = profileFromData(input);
  result.username = result.username.trim().replace(/^@/, "").toLowerCase();
  if (!/^[a-z0-9_]{2,30}$/.test(result.username)) throw new Error("Choose a username with 2–30 letters, numbers or underscores.");
  for (const [key, , limit] of profileFields) {
    result[key] = result[key].trim();
    if (result[key].length > limit) throw new Error(`${key === "bio" ? "Bio" : "Profile field"} is too long.`);
    if (key.endsWith("username") || key === "youtube_channel") {
      result[key] = result[key].replace(/^@/, "");
      if (!/^[a-zA-Z0-9_.-]*$/.test(result[key])) throw new Error("Enter social handles only, without a full URL.");
    }
  }
  if (result.website) {
    const url = new URL(/^https?:\/\//i.test(result.website) ? result.website : `https://${result.website}`);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || !url.hostname.includes(".")) throw new Error("Enter a valid website URL.");
    result.website = url.href;
  }
  return result;
}
export function safeProfileUrl(value: string) {
  try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.href : undefined; } catch { return undefined; }
}
