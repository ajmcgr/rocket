import { createFileRoute } from "@tanstack/react-router";
import Signup from "@/pages/Signup";

export const Route = createFileRoute("/signup")({
  head: () => ({ meta: [{ title: "Sign up | Rocket" }, { name: "robots", content: "noindex" }] }),
  component: Signup,
});
