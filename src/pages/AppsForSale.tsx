import { useEffect, useMemo, useState } from "react";
import { Link } from "@/lib/router-compat";
import SiteHeader from "@/components/SiteHeader";
import AppLogo from "@/components/AppLogo";
import AppTrustBadges from "@/components/AppTrustBadges";
import type { AppTrust } from "@/lib/appTrust";
import { askingPrice, type PublicAcquisitionListing } from "@/lib/rocketAcquisition";
import { track } from "@/lib/analytics";

export type SaleApp = { id: string; slug: string | null; name: string; tagline: string | null; description: string | null; categories: string[]; logo_url: string | null };
export type SaleItem = { listing: PublicAcquisitionListing; app: SaleApp; trust?: AppTrust | null };
export default function AppsForSale({ initial }: { initial?: SaleItem[] }) {
  const items = initial || [];
  const [status, setStatus] = useState("all");
  const [category, setCategory] = useState("all");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [sort, setSort] = useState("recent");
  useEffect(() => { track("for_sale_page_viewed"); }, []);
  const categories = useMemo(() => [...new Set(items.flatMap((item) => item.app.categories || []))].sort(), [items]);
  const filtered = useMemo(() => items.filter((item) =>
    (status === "all" || item.listing.status === status) &&
    (category === "all" || item.app.categories?.includes(category)) &&
    (!minPrice || (item.listing.asking_price_cents != null && item.listing.asking_price_cents >= Number(minPrice) * 100)) &&
    (!maxPrice || (item.listing.asking_price_cents != null && item.listing.asking_price_cents <= Number(maxPrice) * 100))
  ).sort((a, b) => {
    if (sort === "low") return (a.listing.asking_price_cents ?? Infinity) - (b.listing.asking_price_cents ?? Infinity);
    if (sort === "high") return (b.listing.asking_price_cents ?? -1) - (a.listing.asking_price_cents ?? -1);
    return b.listing.updated_at.localeCompare(a.listing.updated_at);
  }), [items, status, category, minPrice, maxPrice, sort]);
  const listSchema = items.length ? {
    "@context": "https://schema.org", "@type": "ItemList",
    itemListElement: items.map(({ app }, index) => ({
      "@type": "ListItem", position: index + 1,
      url: `https://tryrocket.ai/apps/${encodeURIComponent(app.slug || app.id)}`,
      name: app.name,
    })),
  } : null;
  return <div className="marketplace-page min-h-screen bg-[#f6f8fb] text-neutral-900">
    {listSchema && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(listSchema).replace(/</g, "\\u003c") }} />}
    <SiteHeader /><main className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
    <h1 className="text-4xl font-bold tracking-tight">Apps for Sale</h1>
    <p className="mt-3 max-w-2xl text-neutral-600">Discover software businesses available for acquisition. Connect directly with founders and explore your next opportunity.</p>
    <div className="mt-8 grid gap-3 rounded-2xl border border-neutral-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-5" aria-label="Filter apps for sale">
      <label className="text-sm">Availability<select value={status} onChange={(e) => setStatus(e.target.value)} className="mt-1 block min-h-11 w-full rounded-lg border px-3"><option value="all">All</option><option value="for_sale">For sale</option><option value="open_to_offers">Open to offers</option></select></label>
      <label className="text-sm">Category<select value={category} onChange={(e) => setCategory(e.target.value)} className="mt-1 block min-h-11 w-full rounded-lg border px-3"><option value="all">All categories</option>{categories.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
      <label className="text-sm">Min price (USD)<input type="number" min="1" value={minPrice} onChange={(e) => setMinPrice(e.target.value)} placeholder="Any" className="mt-1 block min-h-11 w-full rounded-lg border px-3" /></label>
      <label className="text-sm">Max price (USD)<input type="number" min="1" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} placeholder="Any" className="mt-1 block min-h-11 w-full rounded-lg border px-3" /></label>
      <label className="text-sm">Sort<select value={sort} onChange={(e) => setSort(e.target.value)} className="mt-1 block min-h-11 w-full rounded-lg border px-3"><option value="recent">Recently listed</option><option value="low">Price: low to high</option><option value="high">Price: high to low</option></select></label>
    </div>
    {filtered.length === 0 && <div className="mt-8 rounded-2xl border border-neutral-200 bg-white p-8"><h2 className="font-semibold">No matching apps yet</h2><p className="mt-2 text-sm text-neutral-600">Try different filters or check back as verified owners add listings.</p></div>}
    <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{filtered.map(({ listing, app, trust }) => <Link key={app.id} to={`/apps/${app.slug || app.id}`} onClick={() => track("acquisition_listing_viewed", { app_id: app.id })} className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm hover:border-sky-300 hover:shadow-md">
      <div className="flex items-start gap-3"><AppLogo name={app.name} src={app.logo_url} className="h-14 w-14 shrink-0" /><div className="min-w-0"><h2 className="truncate text-lg font-semibold">{app.name}</h2><p className="text-xs text-sky-800">{app.categories?.[0] || "App"}</p></div></div>
      <p className="mt-4 line-clamp-2 min-h-10 text-sm text-neutral-600">{app.tagline || app.description || "Explore this app on Rocket."}</p>
      <p className="mt-4 text-sm font-semibold">{listing.status === "for_sale" ? "For sale" : "Open to offers"}</p>
      {listing.status === "for_sale" && <p className="mt-1 text-sm text-neutral-700">{askingPrice(listing.asking_price_cents)}</p>}
      <AppTrustBadges trust={trust} compact className="mt-3" />
      <span className="mt-4 block text-sm font-semibold text-sky-700">View app →</span>
    </Link>)}</div>
  </main></div>;
}
