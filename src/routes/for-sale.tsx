import { createFileRoute } from "@tanstack/react-router";
import AppsForSale, { type SaleApp, type SaleItem } from "@/pages/AppsForSale";
import { acquisitionDb as db, type PublicAcquisitionListing } from "@/lib/rocketAcquisition";
import type { AppTrust } from "@/lib/appTrust";

export const Route = createFileRoute("/for-sale")({
  loader: async (): Promise<SaleItem[]> => {
    const listings = await db.from("public_rocket_acquisition_listings").select("*")
      .eq("review_status", "approved").neq("status", "not_for_sale").order("updated_at", { ascending: false }).limit(100);
    if (listings.error) throw listings.error;
    const ids = (listings.data || []).map((row: PublicAcquisitionListing) => row.app_id);
    if (!ids.length) return [];
    const [apps, trustResult] = await Promise.all([
      db.from("public_discoverable_apps").select("id,slug,name,tagline,description,categories,logo_url").in("id", ids),
      db.from("public_app_trust").select("*").in("app_id", ids),
    ]);
    if (apps.error) throw apps.error;
    if (trustResult.error) throw trustResult.error;
    const byId = new Map<string, SaleApp>((apps.data || []).map((app: SaleApp) => [app.id, app]));
    const trustById = new Map<string, AppTrust>((trustResult.data || []).map((trust: AppTrust) => [trust.app_id, trust]));
    return (listings.data as PublicAcquisitionListing[]).flatMap((listing) => {
      const app = byId.get(listing.app_id);
      return app ? [{ listing, app, trust: trustById.get(app.id) || null }] : [];
    });
  },
  head: () => ({
    meta: [
      { title: "Apps for Sale | Rocket" },
      { name: "description", content: "Discover software businesses available for acquisition. Connect directly with founders on Rocket." },
      { property: "og:title", content: "Apps for Sale | Rocket" },
      { property: "og:url", content: "https://tryrocket.ai/for-sale" },
    ],
    links: [{ rel: "canonical", href: "https://tryrocket.ai/for-sale" }],
  }),
  component: () => <AppsForSale initial={Route.useLoaderData()} />,
});
