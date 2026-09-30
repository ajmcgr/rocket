import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "@/lib/router-compat";
import {
  ArrowRight,
  BadgeCheck,
  Compass,
  Link2,
  Search,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import DiscoveryPreview from "@/components/DiscoveryPreview";
import { useDocumentMeta } from "@/hooks/useDocumentMeta";
import { track } from "@/lib/analytics";

export default function Home() {
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  useDocumentMeta({
    title: "Rocket — Discover independent apps worth using",
    description:
      "Find rising apps and new software from independent developers.",
    canonical: "https://tryrocket.ai/",
  });

  const search = (event: FormEvent) => {
    event.preventDefault();
    const term = query.trim();
    track("discovery_search", { source: "homepage", has_query: Boolean(term) });
    navigate(term ? `/discover?q=${encodeURIComponent(term)}` : "/discover");
  };

  return (
    <div className="marketplace-page min-h-screen bg-[#f7f9fc] pb-16 text-neutral-900 lg:pb-0">
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-5 pb-20 sm:px-8">
        <section className="mx-auto max-w-5xl pb-7 pt-14 text-center sm:pt-20 lg:pt-24">
          <p className="text-sm font-semibold tracking-[0.15em] text-sky-800">
            THE INDEPENDENT WEB, WELL CURATED
          </p>
          <h1 className="mt-5 font-display text-[clamp(2.8rem,7vw,5.8rem)] leading-[1.04] tracking-[-0.035em] text-neutral-950">
            Discover independent apps worth using.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-neutral-600 sm:text-lg">
            Find rising apps and new software from independent developers.
          </p>
          <form
            onSubmit={search}
            role="search"
            className="mx-auto mt-8 flex w-full max-w-2xl gap-2 rounded-2xl border border-neutral-200 bg-white p-2 shadow-[0_16px_50px_-26px_rgba(15,23,42,0.35)] focus-within:border-sky-500 focus-within:ring-2 focus-within:ring-sky-200"
          >
            <Search
              className="my-auto ml-3 h-5 w-5 shrink-0 text-neutral-400"
              aria-hidden="true"
            />
            <input
              aria-label="Search apps"
              placeholder="Search apps..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="min-w-0 flex-1 bg-transparent px-1 text-base outline-hidden"
            />
            <button className="min-h-11 rounded-xl bg-neutral-900 px-4 text-sm font-semibold text-white transition hover:bg-neutral-700 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-sky-500">
              Search
            </button>
          </form>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-5 text-sm font-semibold">
            <Link
              to="/discover"
              className="inline-flex min-h-11 items-center gap-1 text-sky-800 hover:underline"
            >
              Explore apps <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/launch"
              className="inline-flex min-h-11 items-center text-neutral-700 hover:underline"
            >
              Launch your app
            </Link>
          </div>
        </section>
        <DiscoveryPreview />
        <section
          className="mt-20 border-t border-neutral-200 pt-16 sm:mt-24 sm:pt-20"
          aria-labelledby="platform-heading"
        >
          <div className="max-w-3xl">
            <p className="text-sm font-semibold tracking-[0.14em] text-sky-800">
              A BETTER WAY TO EXPLORE
            </p>
            <h2
              id="platform-heading"
              className="mt-3 font-display text-3xl leading-tight text-neutral-950 sm:text-5xl"
            >
              Go beyond the usual apps.
            </h2>
          </div>
          <div className="mt-9 grid gap-3 md:grid-cols-3">
            {[
              {
                label: "Discover",
                Icon: Compass,
                copy: "Find independent apps worth using across the open web.",
              },
              {
                label: "Save",
                Icon: BadgeCheck,
                copy: "Keep the apps you want to try in one place.",
              },
              {
                label: "Launch",
                Icon: Sparkles,
                copy: "Add your own app and help people find it.",
              },
            ].map(({ label, Icon, copy }) => (
              <div
                key={label}
                className="rounded-[1.75rem] border border-neutral-200 bg-white p-6 shadow-[0_14px_42px_-34px_rgba(15,23,42,0.35)] sm:p-7"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-sky-50 text-sky-800">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <h3 className="mt-7 font-display text-2xl text-neutral-950">
                  {label}
                </h3>
                <p className="mt-2 max-w-xs text-sm leading-relaxed text-neutral-600">
                  {copy}
                </p>
              </div>
            ))}
          </div>
        </section>
        <section
          className="mt-20 overflow-hidden rounded-[2rem] bg-neutral-950 p-7 text-white sm:mt-24 sm:p-12"
          aria-labelledby="developer-heading"
        >
          <div className="max-w-3xl">
            <p className="text-sm font-semibold tracking-[0.14em] text-sky-300">
              BUILT FOR INDEPENDENT SOFTWARE
            </p>
            <h2
              id="developer-heading"
              className="mt-3 font-display text-3xl leading-tight sm:text-5xl"
            >
              Your app belongs on the open web.
            </h2>
            <p className="mt-4 max-w-2xl leading-relaxed text-neutral-300">
              Give people a clear place to find your app, show what you can
              verify, and connect to Rocket where it fits.
            </p>
          </div>
          <div className="mt-9 grid gap-6 border-t border-white/15 pt-8 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                label: "Launch",
                Icon: Sparkles,
                copy: "Add your app to Rocket.",
              },
              {
                label: "Verify",
                Icon: BadgeCheck,
                copy: "Build trust with details you choose to share.",
              },
              {
                label: "Connect",
                Icon: Link2,
                copy: "Use Rocket identity and payment integrations where supported.",
              },
              {
                label: "Grow",
                Icon: TrendingUp,
                copy: "Help more people discover your app.",
              },
            ].map(({ label, Icon, copy }) => (
              <div key={label}>
                <Icon className="h-5 w-5 text-sky-300" aria-hidden="true" />
                <h3 className="mt-4 text-base font-semibold">{label}</h3>
                <p className="mt-1 text-sm leading-relaxed text-neutral-300">
                  {copy}
                </p>
              </div>
            ))}
          </div>
          <Link
            to="/launch"
            className="mt-9 inline-flex min-h-11 items-center gap-2 rounded-xl bg-white px-5 text-sm font-semibold text-neutral-950 transition hover:bg-neutral-100 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-sky-300"
          >
            Launch your app <ArrowRight className="h-4 w-4" />
          </Link>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
