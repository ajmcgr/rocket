import { createFileRoute, notFound, redirect } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppProfileRouteSkeleton } from "@/components/MarketplaceLoadingSkeletons";
import { loadAppMedia } from "@/lib/appMedia";
import { shareCardUrl, shareCardVersion } from "@/lib/shareLinks";

const siteUrl = "https://tryrocket.ai";
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
    if (!data) throw notFound();
    if (isId && data.slug) {
      throw redirect({
        href: `/apps/${encodeURIComponent(data.slug)}${location.searchStr}${location.hash ? `#${location.hash}` : ""}`,
        statusCode: 301,
        replace: true,
      });
    }
    // Primary gallery metadata reserves its final geometry in the SSR response.
    // Images still load responsively/lazily; reviews/evidence remain independent.
    const media = (await loadAppMedia([data.id], false)).get(data.id) || [];
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
    const image = shareCardUrl("app", app.slug || app.id, "landscape", shareCardVersion(app.name, app.tagline, app.description, app.logo_url, loaderData?.media?.map((item) => item.source_url)));
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:url", content: canonical },
        { property: "og:image", content: image },
        { property: "og:image:width", content: "1200" },
        { property: "og:image:height", content: "630" },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
        { name: "twitter:image", content: image },
      ],
      links: [{ rel: "canonical", href: canonical }],
    };
  },
  component: AppProfileRoute,
  notFoundComponent: () => <Suspense fallback={<AppProfileRouteSkeleton />}><Profile initialApp={null} initialMedia={[]} /></Suspense>,
});

function AppProfileRoute() {
  const { app, media } = Route.useLoaderData();
  if (!app) return <Suspense fallback={<AppProfileRouteSkeleton />}><Profile initialApp={app} initialMedia={media} /></Suspense>;
  const canonical = `${siteUrl}/apps/${app.slug || app.id}`;
  const description = app.description?.trim() || app.tagline?.trim() || undefined;
  const category = app.categories?.[0] || undefined;
  const schema = [
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: app.name,
      url: canonical,
      ...(description ? { description } : {}),
      ...(category ? { applicationCategory: category } : {}),
      ...(app.logo_url && /^https:\/\//i.test(app.logo_url) ? { image: app.logo_url } : {}),
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${siteUrl}/` },
        { "@type": "ListItem", position: 2, name: "Discover", item: `${siteUrl}/discover` },
        { "@type": "ListItem", position: 3, name: app.name, item: canonical },
      ],
    },
  ];
  return <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, "\\u003c") }} />
    <Suspense fallback={<AppProfileRouteSkeleton />}><Profile initialApp={app} initialMedia={media} /></Suspense>
  </>;
}
