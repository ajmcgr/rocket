import { createFileRoute } from "@tanstack/react-router";
import { Navigate } from "@/lib/router-compat";

export const Route = createFileRoute("/media-kit")({
  component: () => <Navigate to="/brand-kit" replace />,
});
