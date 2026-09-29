import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Search } from "lucide-react";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import DiscoveryPreview from "@/components/DiscoveryPreview";
import { useDocumentMeta } from "@/hooks/useDocumentMeta";

export default function Home() {
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  useDocumentMeta({ title: "Rocket — One account for every app", description: "Discover independent apps worth using. Explore what is rising, find new products, and launch your own app on Rocket.", canonical: "https://tryrocket.ai/" });

  const search = (event: FormEvent) => {
    event.preventDefault();
    const term = query.trim();
    navigate(term ? `/discover?q=${encodeURIComponent(term)}` : "/discover");
  };

  return <div className="min-h-screen bg-[#f7f9fc] pb-16 text-neutral-900 lg:pb-0">
    <SiteHeader />
    <main className="mx-auto max-w-7xl px-5 pb-20 sm:px-8">
      <section className="pb-8 pt-14 sm:pt-20">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-700">Rocket</p>
        <h1 className="mt-4 max-w-4xl font-display text-5xl leading-[1.08] tracking-tight text-neutral-950 sm:text-7xl">One account for every app.</h1>
        <p className="mt-5 text-lg text-neutral-600 sm:text-xl">Discover independent apps worth using.</p>
        <form onSubmit={search} role="search" className="mt-9 flex w-full max-w-2xl gap-2 rounded-2xl border border-neutral-200 bg-white p-2 shadow-sm focus-within:ring-2 focus-within:ring-sky-200">
          <Search className="my-auto ml-3 h-5 w-5 shrink-0 text-neutral-400" aria-hidden="true" />
          <input aria-label="Search apps" placeholder="Search apps, tools, or ideas" value={query} onChange={(event) => setQuery(event.target.value)} className="min-w-0 flex-1 bg-transparent px-1 text-sm outline-none sm:text-base" />
          <button className="rounded-xl bg-neutral-900 px-4 py-3 text-sm font-semibold text-white hover:bg-neutral-700">Search</button>
        </form>
        <div className="mt-5 flex flex-wrap items-center gap-5 text-sm font-semibold"><Link to="/discover" className="inline-flex items-center gap-1 text-sky-700 hover:underline">Explore apps <ArrowRight className="h-4 w-4" /></Link><Link to="/launch" className="text-neutral-700 hover:underline">Launch your app</Link></div>
      </section>
      <DiscoveryPreview />
      <section className="mt-16 flex flex-col gap-4 rounded-3xl bg-sky-50 p-7 sm:flex-row sm:items-center sm:justify-between sm:p-9">
        <div><h2 className="font-display text-2xl text-neutral-950 sm:text-3xl">Built something people should know about?</h2><p className="mt-2 max-w-2xl text-sm text-neutral-600">Add your app, claim its listing, and choose which verified details to share.</p></div>
        <Link to="/launch" className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-sky-700 px-5 py-3 text-sm font-semibold text-white hover:bg-sky-800">Launch your app <ArrowRight className="h-4 w-4" /></Link>
      </section>
    </main>
    <SiteFooter />
  </div>;
}
