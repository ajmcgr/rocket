import { useEffect, useState } from "react";
import { ArrowRight, Plus } from "lucide-react";
import { Link } from "@/lib/router-compat";
import { useAuth } from "@/contexts/AuthContext";
import AppLogo from "@/components/AppLogo";
import type { MyApp } from "@/components/AppJourney";
import { loadMyApps, myAppStatus } from "@/lib/myApps";

export default function MyApps() {
  const { user, loading: authLoading } = useAuth();
  const userId = user?.id;
  const [loaded, setLoaded] = useState<{
    owner: string;
    items: MyApp[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const items = loaded && loaded.owner === userId ? loaded.items : [];

  useEffect(() => {
    let active = true;
    setLoaded(null);
    setError("");
    setLoading(true);
    if (authLoading)
      return () => {
        active = false;
      };
    if (!userId) {
      setLoading(false);
      return () => {
        active = false;
      };
    }
    loadMyApps()
      .then((result) => {
        if (active) setLoaded({ owner: userId, items: result });
      })
      .catch(() => {
        if (active)
          setError("My apps could not be loaded right now. Please try again.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [userId, authLoading]);

  return (
    <main className="mx-auto max-w-6xl px-5 pb-24 pt-10 text-neutral-900 sm:px-8 sm:pt-14">
      <h1 className="font-display text-4xl sm:text-5xl">My Apps</h1>
      <p className="mt-3 max-w-2xl text-neutral-500">
        Your apps in one place. Select an app to manage its listing, connections
        and settings.
      </p>
      <Link
        to="/submit"
        className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#167ac6] px-5 text-sm font-semibold text-white transition hover:bg-[#1268aa] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#167ac6]"
      >
        <Plus size={18} aria-hidden="true" /> Submit my app
      </Link>

      {loading && (
        <div
          role="status"
          aria-label="Loading your apps"
          className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {[0, 1, 2].map((item) => (
            <div
              key={item}
              className="rocket-skeleton-surface h-52 animate-pulse rounded-3xl border border-neutral-200 bg-white p-6"
            />
          ))}
        </div>
      )}
      {error && (
        <p
          role="alert"
          className="mt-8 rounded-2xl border border-red-200 bg-white p-6 text-sm text-red-700"
        >
          {error}
        </p>
      )}
      {!loading && !error && !items.length && (
        <div className="mt-8 rounded-3xl border border-neutral-200 bg-white p-8">
          <p className="font-semibold">Your first app belongs here.</p>
          <p className="mt-2 text-sm text-neutral-600">
            Submit an app, then return here to manage its Rocket listing.
          </p>
        </div>
      )}
      {!loading && !error && !!items.length && (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <Link
              key={item.app_id}
              to={`/my-apps/${item.app_id}`}
              aria-label={`Manage ${item.app?.name || "app under review"}`}
              className="group flex min-h-52 min-w-0 flex-col rounded-3xl border border-neutral-200 bg-white p-6 transition hover:border-[#469DDA] hover:shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#469DDA]"
            >
              <AppLogo
                name={item.app?.name || "App under review"}
                src={item.app?.logo_url}
                className="h-14 w-14"
              />
              <div className="mt-auto pt-7">
                <h2 className="truncate text-xl font-semibold tracking-tight text-neutral-950">
                  {item.app?.name || "App under review"}
                </h2>
                <p className="mt-1 truncate text-sm text-neutral-500">
                  {item.app?.website_url || "Private submission"}
                </p>
                <div className="mt-4 flex items-center justify-between gap-3 text-sm">
                  <span className="text-neutral-600">{myAppStatus(item)}</span>
                  <ArrowRight
                    size={18}
                    className="text-sky-700 transition group-hover:translate-x-1"
                    aria-hidden="true"
                  />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
