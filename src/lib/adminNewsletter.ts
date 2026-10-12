import { supabase } from "@/integrations/supabase/client";
import {
  publicCollections,
  collectionPath,
  type Collection,
} from "@/lib/collections";
import {
  loadHomeMerchandising,
  type HomeApp,
  type ShelfItem,
} from "@/lib/homeMerchandising";
import { marketplaceRpc } from "@/lib/marketplace";

export type NewsletterPlacement = {
  sponsorship_id: string;
  sponsorship_type: "featured_app" | "category_sponsor";
  category: string | null;
  app: HomeApp;
};

export type NewsletterSection = {
  key: string;
  title: string;
  description: string;
  entries: Array<{
    title: string;
    subtitle: string;
    url: string;
    sponsored?: boolean;
  }>;
};

const root = "https://tryrocket.ai";
const appLink = (app: HomeApp) =>
  `${root}/apps/${encodeURIComponent(app.slug || app.id)}`;
const clean = (value: string | null | undefined) =>
  (value || "").replace(/\s+/g, " ").trim();
const summary = (app: HomeApp) =>
  clean(app.tagline || app.description).slice(0, 180);
const appEntry = (app: HomeApp) => ({
  title: app.name,
  subtitle: summary(app),
  url: appLink(app),
});
const safeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[char] || char,
  );

export async function loadNewsletterSections(): Promise<NewsletterSection[]> {
  // Match Rocket's public shelves, then read only public collections and
  // server-authoritative active ad inventory. No buyer or payment data is used.
  const [home, discoverResult, collections, placementResult] =
    await Promise.all([
      loadHomeMerchandising({ strict: true }),
      marketplaceRpc("search_marketplace", {
        p_query: "",
        p_category: "",
        p_platform: "",
        p_pricing: "",
        p_billing: "",
        p_source: "",
        p_sort: "discovered",
        p_offset: 0,
        p_limit: 6,
      }),
      publicCollections(),
      (
        supabase.rpc.bind(supabase) as unknown as (
          name: string,
          args: Record<string, unknown>,
        ) => Promise<{ data: unknown; error: Error | null }>
      )("active_rocket_sponsorships", { p_category: null }),
    ]);
  if (discoverResult.error) throw discoverResult.error;
  if (placementResult.error) throw placementResult.error;

  const slots = (placementResult.data || []) as Array<{
    sponsorship_id: string;
    sponsorship_type: string;
    app_id: string;
    category: string | null;
  }>;
  const adIds = [...new Set(slots.map((slot) => slot.app_id))];
  const adApps = adIds.length
    ? await supabase
        .from("public_discoverable_apps")
        .select("*")
        .in("id", adIds)
    : { data: [] as HomeApp[], error: null };
  if (adApps.error) throw adApps.error;
  const appsById = new Map((adApps.data || []).map((app) => [app.id, app]));
  const placements: NewsletterPlacement[] = slots.flatMap((slot) => {
    const app = appsById.get(slot.app_id);
    return app &&
      (slot.sponsorship_type === "featured_app" ||
        slot.sponsorship_type === "category_sponsor")
      ? [
          {
            sponsorship_id: slot.sponsorship_id,
            sponsorship_type: slot.sponsorship_type,
            category: slot.category,
            app,
          },
        ]
      : [];
  });
  const featured = placements.filter(
    (slot) => slot.sponsorship_type === "featured_app",
  );
  const featuredIds = new Set(featured.map((slot) => slot.app.id));
  const categoryAds = placements.filter(
    (slot) => slot.sponsorship_type === "category_sponsor",
  );
  const shelf = (items: ShelfItem[]) => items.map((item) => appEntry(item.app));
  const categories = home.categories.map((row) => ({
    title: row.category,
    subtitle: `${Number(row.app_count).toLocaleString()} apps`,
    url: `${root}/discover?view=all&category=${encodeURIComponent(row.category)}`,
  }));
  for (const slot of categoryAds) {
    // Show sponsored category inventory even when its category is outside the
    // eight most popular categories on the homepage.
    if (!categories.some((entry) => entry.title === slot.category)) {
      categories.push({
        title: slot.category || "Category",
        subtitle: "Explore apps",
        url: `${root}/discover?view=all&category=${encodeURIComponent(slot.category || "")}`,
      });
    }
  }

  return [
    {
      key: "discover",
      title: "Discover",
      description: "Recently discovered apps on Rocket",
      entries: [
        ...featured.map((slot) => ({ ...appEntry(slot.app), sponsored: true })),
        ...(discoverResult.data?.apps || [])
          .filter((app) => !featuredIds.has(app.id))
          .map(appEntry),
      ],
    },
    {
      key: "picks",
      title: "Our picks",
      description: "Apps selected by Rocket's editors",
      entries: shelf(home.picks),
    },
    {
      key: "rising",
      title: "Rising",
      description: "Most viewed app pages on Rocket",
      entries: shelf(home.rising),
    },
    {
      key: "rankings",
      title: "Rankings",
      description: "Ranked by reviews, bookmarks and verified purchases",
      entries: shelf(home.top),
    },
    {
      key: "collections",
      title: "Collections",
      description: "Public community collections",
      entries: collections.slice(0, 6).map((collection: Collection) => ({
        title: collection.name,
        subtitle: `${collection.app_count} public apps`,
        url: `${root}${collectionPath(collection)}`,
      })),
    },
    {
      key: "new",
      title: "New & Noteworthy",
      description: "New to Rocket with imagery and community interest",
      entries: shelf(home.fresh),
    },
    {
      key: "categories",
      title: "Categories",
      description: "Explore apps by what you want to do",
      entries: categories.flatMap((entry) => {
        const sponsored = categoryAds
          .filter((slot) => slot.category === entry.title)
          .map((slot) => ({
            ...appEntry(slot.app),
            title: `${slot.app.name} · ${entry.title}`,
            sponsored: true,
          }));
        return [entry, ...sponsored];
      }),
    },
  ];
}

export function newsletterCopy(sections: NewsletterSection[]) {
  const available = sections.filter((section) => section.entries.length);
  const plain = available
    .map(
      (section) =>
        `${section.title}\n${section.description}\n\n${section.entries
          .map(
            (entry) =>
              `${entry.sponsored ? "Sponsored · " : ""}${entry.title}${entry.subtitle ? ` — ${entry.subtitle}` : ""}\n${entry.url}`,
          )
          .join("\n\n")}`,
    )
    .join("\n\n--------------------\n\n");
  // Keep copied blocks flat: Beehiiv may discard content nested in a wrapper.
  const html = available
    .map(
      (section) =>
        `<h2 style="color:#171717;font-size:24px;margin:28px 0 6px">${safeHtml(section.title)}</h2>` +
        `<p style="color:#666;margin:0 0 18px">${safeHtml(section.description)}</p>` +
        section.entries
          .map(
            (entry) =>
              `<p style="margin:0 0 16px">${entry.sponsored ? '<strong style="color:#167ac6">Sponsored · </strong>' : ""}<a href="${safeHtml(entry.url)}" style="color:#167ac6;font-weight:700">${safeHtml(entry.title)}</a>${entry.subtitle ? ` — ${safeHtml(entry.subtitle)}` : ""}</p>`,
          )
          .join(""),
    )
    .join('<hr style="border:0;border-top:1px solid #e5e5e5;margin:28px 0">');
  return { html, plain };
}
