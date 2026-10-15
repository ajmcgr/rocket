import { createFileRoute } from "@tanstack/react-router";
import Login from "@/pages/Login";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Log in | Rocket" }, { name: "robots", content: "noindex" }] }),
  component: Login,
});
