import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { seoHead } from "@/lib/seoHead";

export const Route = createFileRoute("/tools/")({
  head: () => seoHead("Free AI branding tools for founders — Rocket", "Generate taglines, value propositions, names, pitches, bios and more with Rocket's free AI tools.", "/tools"),
  component: lazyRouteComponent(() => import("@/pages/Tools")),
});
