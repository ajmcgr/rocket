import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { seoHead } from "@/lib/seoHead";

export const Route = createFileRoute("/resources/")({
  head: () => seoHead("Branding Resources for Founders — Rocket", "Evergreen guides on startup branding, logo design, brand kits, typography, colour psychology, and icon design.", "/resources"),
  component: lazyRouteComponent(() => import("@/pages/Resources")),
});
