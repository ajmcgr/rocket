import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { SavedAppsRouteSkeleton } from "@/components/MarketplaceLoadingSkeletons";

export const Route = createFileRoute("/_app/saved-apps")({
  head: () => ({ meta: [{ title: 'Saved | Rocket' }, { name: 'robots', content: 'noindex, nofollow' }] }),
  pendingComponent: SavedAppsRouteSkeleton,
  component: lazyRouteComponent(() => import("@/pages/SavedApps")),
});
