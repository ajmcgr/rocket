import { Bookmark, Compass, Layers3, Palette, Plus, type LucideIcon } from "lucide-react";

export type Destination = { label: string; to: string; icon: LucideIcon; matches: (path: string) => boolean };

export const destinations: Destination[] = [
  { label: "Discover", to: "/discover", icon: Compass, matches: (path) => path === "/discover" || path.startsWith("/apps/") && path !== "/apps/add" },
  { label: "Saved", to: "/saved-apps", icon: Bookmark, matches: (path) => path === "/saved-apps" },
  { label: "Your Apps", to: "/your-apps", icon: Layers3, matches: (path) => path === "/your-apps" || path.startsWith("/my-apps") },
  { label: "Submit", to: "/submit", icon: Plus, matches: (path) => path === "/submit" || path === "/launch" || path === "/apps/add" },
  { label: "Create", to: "/create", icon: Palette, matches: (path) => ["/create", "/logos", "/icons", "/wizard", "/templates", "/saved", "/brands", "/editor", "/trash", "/designs"].some((route) => path === route || path.startsWith(`${route}/`)) },
];
