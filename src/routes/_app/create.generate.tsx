import { createFileRoute } from "@tanstack/react-router";
import { Navigate } from "@/lib/router-compat";

export const Route = createFileRoute("/_app/create/generate")({
  component: () => <Navigate to="/wizard" replace />,
});
