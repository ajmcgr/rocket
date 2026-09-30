import { createFileRoute } from "@tanstack/react-router";
import { Navigate } from "@/lib/router-compat";

export const Route = createFileRoute("/_app/generate")({
  component: () => <Navigate to="/logos" replace />,
});
