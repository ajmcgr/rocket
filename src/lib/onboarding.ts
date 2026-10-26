import { safeReturnPath } from "./navigation";
import type { MyApp } from "@/components/AppJourney";

// Keep the original key: shipping a better tour must not replay it for members.
export const ONBOARDING_STORAGE_KEY = "rocket.onboarding.v2";
export type OnboardingIntent = "building" | "built" | "exploring";
export const onboardingSteps = [
  "welcome",
  "intent",
  "app",
  "profile",
  "traction",
  "growth",
  "complete",
] as const;

// An allowlist leaves claims, OAuth/verification callbacks, editors and checkout
// returns uninterrupted. Never consume or rewrite their destinations or tokens.
export function canShowOnboarding(pathname: string, search = "", hash = "") {
  if (
    ![
      "/",
      "/discover",
      "/your-apps",
      "/my-apps",
      "/dashboard",
      "/settings/profile",
      "/settings/account",
    ].includes(pathname)
  )
    return false;
  const query = new URLSearchParams(search);
  for (const key of query.keys()) {
    if (
      ![
        "view",
        "q",
        "category",
        "utm_source",
        "utm_medium",
        "utm_campaign",
        "utm_content",
        "utm_term",
        "welcome",
      ].includes(key)
    )
      return false;
  }
  if (query.has("welcome") && query.get("welcome") !== "1") return false;
  return !hash || hash.replace(/^#/, "") === "onboarding";
}
export function ownedOnboardingApps(items: MyApp[]) {
  return items.filter((item) => item.owned && item.app);
}
export function eligibleOnboardingApps(items: MyApp[]) {
  return ownedOnboardingApps(items).filter(
    (item) => item.owner_verification_level === "domain_verified",
  );
}
export function onboardingDestination(
  intent: OnboardingIntent | null,
  items: MyApp[],
) {
  if (intent === "exploring")
    return { label: "Explore apps", to: "/discover", action: "explore" };
  const owned = ownedOnboardingApps(items)[0];
  return owned
    ? {
        label: "Manage my app",
        to: `/my-apps/${encodeURIComponent(owned.app_id)}`,
        action: "manage_app",
      }
    : { label: "Add my app", to: "/submit", action: "add_app" };
}

// A verification handoff requests the existing welcome on ordinary landing
// pages only. Sensitive destinations and their query/hash remain unchanged.
export function verificationReturnPath(value: string | null | undefined) {
  const next = safeReturnPath(value);
  const url = new URL(next, "https://tryrocket.ai");
  if (!canShowOnboarding(url.pathname,url.search,url.hash)) return next;
  url.searchParams.set("welcome","1");
  return `${url.pathname}${url.search}${url.hash}`;
}
