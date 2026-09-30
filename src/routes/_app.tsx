import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import ProtectedRoute from "@/components/ProtectedRoute";

const AppShell = lazyRouteComponent(() => import("@/components/AppShell"));

export const Route = createFileRoute("/_app")({
  component: () => (
    <ProtectedRoute>
      <AppShell />
    </ProtectedRoute>
  ),
});
