import { Bookmark, Compass, Zap, Layers3, Palette, Plus, type LucideIcon } from "lucide-react";

export type Destination = { label: string; to: string; icon: LucideIcon; matches: (path: string) => boolean };

export const destinations: Destination[] = [
  { label: "Discover", to: "/discover", icon: Compass, matches: (path) => path === "/discover" || path.startsWith("/apps/") && path !== "/apps/add" },
  { label: "Rising", to: "/rising", icon: Zap, matches: (path) => path === "/rising" },
  { label: "Collections", to: "/collections", icon: Bookmark, matches: (path) => path === '/collections' || path.startsWith('/collections/') },
  { label: "Saved", to: "/my-collections", icon: Bookmark, matches: (path) => path === "/saved-apps" || path === '/my-collections' || path.startsWith('/my-collections/') },
  { label: "My Apps", to: "/your-apps", icon: Layers3, matches: (path) => path === "/your-apps" || path.startsWith("/my-apps") },
  { label: "Submit", to: "/submit", icon: Plus, matches: (path) => path === "/submit" || path === "/launch" || path === "/apps/add" },
  { label: "Create", to: "/create", icon: Palette, matches: (path) => ["/create", "/logos", "/icons", "/wizard", "/templates", "/saved", "/brands", "/editor", "/trash", "/designs"].some((route) => path === route || path.startsWith(`${route}/`)) },
];
