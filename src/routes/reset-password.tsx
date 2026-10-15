import { createFileRoute } from "@tanstack/react-router";
import ResetPassword from "@/pages/ResetPassword";

export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [{ title: "Reset password | Rocket" }, { name: "robots", content: "noindex" }] }),
  component: ResetPassword,
});
