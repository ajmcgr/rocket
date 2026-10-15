import { createFileRoute } from "@tanstack/react-router";
import AuthCallback from "@/pages/AuthCallback";

export const Route = createFileRoute("/auth/callback")({
  head: () => ({ meta: [{ title: "Signing in | Rocket" }, { name: "robots", content: "noindex" }] }),
  component: AuthCallback,
});
