import { createFileRoute } from "@tanstack/react-router";
import { Navigate } from "@/lib/router-compat";

export const Route = createFileRoute("/join")({
  component: () => <Navigate to="/reserve" replace />,
});
