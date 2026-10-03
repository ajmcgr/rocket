import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "@/lib/router-compat";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import DiscoveryPreview from "@/components/DiscoveryPreview";
import { useDocumentMeta } from "@/hooks/useDocumentMeta";
import { track } from "@/lib/analytics";
import { useAuth } from "@/contexts/AuthContext";

export default function Home() {
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  const { user } = useAuth();
  useDocumentMeta({
    title: "Rocket — The open app platform",
    description:
      "Find rising apps and new software from vibe coders and developers.",
    canonical: "https://tryrocket.ai/",
  });

  const search = (event: FormEvent) => {
    event.preventDefault();
    const term = query.trim();
    track("discovery_search", { source: "homepage", has_query: Boolean(term) });
    navigate(term ? `/discover?q=${encodeURIComponent(term)}` : "/discover");
  };

  return (
    <div className="marketplace-page min-h-screen bg-white pb-16 text-neutral-900 lg:pb-0">
      <SiteHeader />
      <main className="mx-auto max-w-[90rem] px-5 pb-20 sm:px-8">
        <DiscoveryPreview
          intro={!user ? (
            <section className="flex min-w-0 flex-col items-center justify-center py-6 text-center lg:py-10">
              <h1 className="mx-auto max-w-2xl text-[clamp(2.7rem,4.7vw,5.1rem)] font-bold leading-[.98] tracking-[-.06em] text-neutral-950">
                The open app platform.
              </h1>
              <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-neutral-600 sm:text-lg">
                Find rising apps and new software from vibe coders and developers.
              </p>
              <form
                onSubmit={search}
                role="search"
                className="mx-auto mt-7 flex w-full max-w-xl gap-2 rounded-xl border border-neutral-200 bg-white p-1.5 shadow-[0_14px_40px_-30px_rgba(15,23,42,.4)] focus-within:border-[#167ac6] focus-within:ring-2 focus-within:ring-[#167ac6]/20"
              >
                <span className="my-auto ml-3 text-lg" aria-hidden="true">🔎</span>
                <input
                  aria-label="Search apps"
                  placeholder="Search apps..."
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="min-w-0 flex-1 bg-transparent px-1 text-sm outline-none sm:text-base"
                />
                <button className="min-h-11 rounded-lg bg-[#167ac6] px-4 text-sm font-semibold text-white hover:bg-[#1268aa]">
                  Search
                </button>
              </form>
              <div className="mt-5 flex flex-wrap justify-center gap-3 text-sm font-semibold">
                <Link
                  to="/discover"
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#167ac6] px-5 text-white hover:bg-[#1268aa]"
                >
                  Explore apps <span aria-hidden="true">→</span>
                </Link>
                <Link
                  to="/submit"
                  className="inline-flex min-h-11 items-center rounded-xl border border-neutral-200 bg-white px-5 text-neutral-800 hover:bg-neutral-50"
                >
                  Submit your app
                </Link>
              </div>
            </section>
          ) : undefined}
        />
        <section
          className="rocket-developer-panel mt-20 overflow-hidden rounded-[2rem] border border-neutral-200 p-7 text-neutral-950 sm:mt-24 sm:p-12 dark:border-white/10 dark:text-white"
          aria-labelledby="developer-heading"
        >
          <div className="max-w-3xl">
            <p className="text-sm font-semibold text-neutral-700 dark:text-neutral-200">
              Built for vibe coders
            </p>
            <h2
              id="developer-heading"
              className="mt-3 font-display text-3xl leading-tight sm:text-5xl"
            >
              Your app belongs on the open web.
            </h2>
            <p className="mt-4 max-w-2xl leading-relaxed text-neutral-700 dark:text-neutral-200">
              Give people a clear place to find your app, show what you can
              verify, and connect to Rocket where it fits.
            </p>
          </div>
          <div className="mt-9 grid gap-6 border-t border-neutral-950/15 pt-8 sm:grid-cols-2 lg:grid-cols-4 dark:border-white/20">
            {[
              {
                label: "Submit",
                emoji: "🚀",
                copy: "Add your app to Rocket.",
              },
              {
                label: "Verify",
                emoji: "✅",
                copy: "Build trust with details you choose to share.",
              },
              {
                label: "Connect",
                emoji: "🔗",
                copy: "Use Rocket identity and payment integrations where supported.",
              },
              {
                label: "Grow",
                emoji: "📈",
                copy: "Help more people discover your app.",
              },
            ].map(({ label, emoji, copy }) => (
              <div key={label}>
                <span className="text-xl" aria-hidden="true">{emoji}</span>
                <h3 className="mt-4 text-base font-semibold">{label}</h3>
                <p className="mt-1 text-sm leading-relaxed text-neutral-700 dark:text-neutral-200">
                  {copy}
                </p>
              </div>
            ))}
          </div>
          <Link
            to="/submit"
            className="mt-9 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#167ac6] px-5 text-sm font-semibold text-white transition hover:bg-[#1268aa] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-sky-300"
          >
            Submit your app <span aria-hidden="true">→</span>
          </Link>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
