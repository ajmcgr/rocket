import { createFileRoute } from "@tanstack/react-router";
import { Navigate } from "@/lib/router-compat";

export const Route = createFileRoute("/_app/account")({
  component: () => <Navigate to="/settings/profile" replace />,
});
