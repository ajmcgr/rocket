import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { SavedAppsRouteSkeleton } from "@/components/MarketplaceLoadingSkeletons";

export const Route = createFileRoute("/_app/saved-apps")({
  pendingComponent: SavedAppsRouteSkeleton,
  component: lazyRouteComponent(() => import("@/pages/SavedApps")),
});
