import { createFileRoute, redirect } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppProfileRouteSkeleton } from "@/components/MarketplaceLoadingSkeletons";
import { loadAppMedia } from "@/lib/appMedia";

const siteUrl = "https://tryrocket.ai";
const fallbackImage = `${siteUrl}/og-homepage.png`;
const Profile = lazy(() => import("@/pages/PublicAppProfile"));

function summarize(description: string) {
  const firstParagraph = description.trim().split(/\n\s*\n/)[0];
  return firstParagraph.length > 180
    ? `${firstParagraph.slice(0, 180).replace(/\s+\S*$/, "")}…`
    : firstParagraph;
}

export const Route = createFileRoute("/apps/$id")({
  staleTime: 60_000,
  preloadStaleTime: 30_000,
  pendingComponent: AppProfileRouteSkeleton,
  loader: async ({ params, location }) => {
    const isId = /^[0-9a-f-]{36}$/i.test(params.id);
    const { data, error } = await supabase
      .from("public_apps")
      // This curated public view supplies both SEO and the initial profile.
      // Reuse it after hydration rather than fetching the same app again.
      .select("*")
      .eq(isId ? "id" : "slug", params.id)
      .maybeSingle();
    if (error) throw error;
    if (isId && data?.slug) {
      throw redirect({
        href: `/apps/${encodeURIComponent(data.slug)}${location.searchStr}${location.hash ? `#${location.hash}` : ""}`,
        statusCode: 301,
        replace: true,
      });
    }
    // Primary gallery metadata reserves its final geometry in the SSR response.
    // Images still load responsively/lazily; reviews/evidence remain independent.
    const media = data ? (await loadAppMedia([data.id], false)).get(data.id) || [] : [];
    return { app: data, media };
  },
  head: ({ loaderData }) => {
    const app = loaderData?.app;
    if (!app) {
      return {
        meta: [
          { title: "App not found | Rocket" },
          { name: "robots", content: "noindex" },
        ],
      };
    }

    const title = `${app.name} | Rocket`;
    const description =
      app.tagline ||
      (app.description
        ? summarize(app.description)
        : `Explore ${app.name} on Rocket.`);
    const canonical = `${siteUrl}/apps/${app.slug || app.id}`;
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
  component: AppProfileRoute,
});

function AppProfileRoute() {
  const { app, media } = Route.useLoaderData();
  return <Suspense fallback={<AppProfileRouteSkeleton />}><Profile initialApp={app} initialMedia={media} /></Suspense>;
}
