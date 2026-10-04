// Pure validation shared by the submission form and Edge Function.
export type SubmissionDetails = {
  submission_type: "founder";
  name: string;
  tagline: string;
  description: string;
  categories: string[];
  platforms: string[];
  tags: string[];
  stack: string[];
  languages: string[];
  slug: string;
  developer_handle: string;
  pricing_display: string;
  coupon_code: string;
  coupon_description: string;
  logo_url: string;
  hero_url: string;
  screenshots: string[];
  video_url: string;
};

export const SUBMISSION_PLATFORMS = [
  { id: "web", label: "Web" },
  { id: "ios", label: "iOS" },
  { id: "android", label: "Android" },
  { id: "macos", label: "macOS" },
  { id: "windows", label: "Windows" },
  { id: "linux", label: "Linux" },
  { id: "hardware", label: "Hardware" },
];
export const emptySubmission = (): SubmissionDetails => ({
  submission_type: "founder",
  name: "",
  tagline: "",
  description: "",
  categories: [],
  platforms: [],
  tags: [],
  stack: [],
  languages: [],
  slug: "",
  developer_handle: "",
  pricing_display: "",
  coupon_code: "",
  coupon_description: "",
  logo_url: "",
  hero_url: "",
  screenshots: [],
  video_url: "",
});
export function submissionSlug(name: string) {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
export function youtubeUrl(value: string) {
  if (!value.trim()) return "";
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Enter a valid YouTube video URL");
  }
  const host = url.hostname.replace(/^www\./, "");
  const id =
    host === "youtu.be"
      ? url.pathname.slice(1)
      : host === "youtube.com"
        ? url.pathname === "/watch"
          ? url.searchParams.get("v")
          : url.pathname.match(/^\/(?:embed|shorts)\/([^/]+)$/)?.[1]
        : null;
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    !id ||
    !/^[A-Za-z0-9_-]{11}$/.test(id)
  )
    throw new Error("Use a public YouTube video link");
  return `https://www.youtube.com/watch?v=${id}`;
}
export function validateSubmission(value: unknown): SubmissionDetails {
  if (!value || typeof value !== "object")
    throw new Error("App details are required");
  const input = value as Record<string, unknown>;
  const string = (key: string, max: number, min = 0) => {
    if (typeof input[key] !== "string")
      throw new Error(`Invalid ${key.replaceAll("_", " ")}`);
    const result = input[key].trim();
    if (result.length < min || result.length > max)
      throw new Error(
        `Check ${key.replaceAll("_", " ")} (${min}–${max} characters)`,
      );
    return result;
  };
  const list = (key: string, max: number, min = 0, length = 80) => {
    if (
      !Array.isArray(input[key]) ||
      input[key].length < min ||
      input[key].length > max ||
      input[key].some(
        (item: unknown) =>
          typeof item !== "string" || !item.trim() || item.length > length,
      )
    )
      throw new Error(`Choose ${min}–${max} ${key}`);
    return [...new Set((input[key] as string[]).map((item) => item.trim()))];
  };
  const platforms = list("platforms", 7, 1);
  if (platforms.some((id) => !SUBMISSION_PLATFORMS.some((p) => p.id === id)))
    throw new Error("Choose valid platforms");
  const slug = string("slug", 80, 2);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))
    throw new Error("URL slug must use lowercase letters, numbers and hyphens");
  const handle = string("developer_handle", 31).replace(/^@/, "");
  if (handle && !/^[A-Za-z0-9_]{2,30}$/.test(handle))
    throw new Error("Enter a valid developer handle");
  return {
    // Submission classification is fixed, not a claim of verified ownership.
    submission_type: "founder",
    name: string("name", 120, 2),
    tagline: string("tagline", 200, 2),
    description: string("description", 2000, 20),
    categories: list("categories", 3, 1),
    platforms,
    tags: list("tags", 5),
    stack: list("stack", 10),
    languages: list("languages", 5),
    slug,
    developer_handle: handle,
    pricing_display: string("pricing_display", 60),
    coupon_code: string("coupon_code", 50),
    coupon_description: string("coupon_description", 200),
    logo_url: string("logo_url", 2048, 1),
    hero_url: string("hero_url", 2048, 1),
    screenshots: list("screenshots", 6, 0, 2048),
    video_url: youtubeUrl(string("video_url", 2048)),
  };
}
