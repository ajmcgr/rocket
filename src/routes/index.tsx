import { createFileRoute } from "@tanstack/react-router";
import Home from "@/pages/Home";

export const Route = createFileRoute("/")({
  head: () => ({ links: [{ rel: "canonical", href: "https://tryrocket.ai" }] }),
  component: Home,
});
