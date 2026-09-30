import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

const siteUrl = "https://tryrocket.ai";
const fallbackImage = `${siteUrl}/__l5e/assets-v1/0903ee88-5f0b-4c82-b73a-ca1eb9454294/social-sharing-card.png`;

function summarize(description: string) {
  const firstParagraph = description.trim().split(/\n\s*\n/)[0];
  return firstParagraph.length > 180
    ? `${firstParagraph.slice(0, 180).replace(/\s+\S*$/, "")}…`
    : firstParagraph;
}

export const Route = createFileRoute("/apps/$id")({
  loader: async ({ params }) => {
    if (!/^[0-9a-f-]{36}$/i.test(params.id)) return null;
    const { data, error } = await supabase
      .from("public_apps")
      .select("id,name,tagline,description,logo_url")
      .eq("id", params.id)
      .maybeSingle();
    if (error) throw error;
    return data;
  },
  head: ({ loaderData: app }) => {
    if (!app) {
      return {
        meta: [
          { title: "App not found | Rocket" },
          { name: "robots", content: "noindex" },
        ],
      };
    }

    const title = `${app.name} | Rocket Discover`;
    const description =
      app.tagline ||
      (app.description
        ? summarize(app.description)
        : `Explore ${app.name} on Rocket.`);
    const canonical = `${siteUrl}/apps/${app.id}`;
    const image =
      app.logo_url && /^https:\/\//i.test(app.logo_url)
        ? app.logo_url
        : fallbackImage;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:url", content: canonical },
        { property: "og:image", content: image },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
        { name: "twitter:image", content: image },
      ],
      links: [{ rel: "canonical", href: canonical }],
    };
  },
  component: lazyRouteComponent(() => import("@/pages/PublicAppProfile")),
});
