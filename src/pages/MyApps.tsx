import { useEffect, useState } from "react";
import { Link } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import AppJourney, { type MyApp } from "@/components/AppJourney";
import AppLogo from "@/components/AppLogo";
import DeveloperProductCards from "@/components/DeveloperProductCards";
import AppDisconnectControls from "@/components/AppDisconnectControls";
import { BarChart3 } from "lucide-react";

export default function MyApps() {
  const [items, setItems] = useState<MyApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sourceFor, setSourceFor] = useState<string | null>(null);
  const [sourceUrl, setSourceUrl] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    supabase.functions
      .invoke("rocket-apps", { body: { action: "my_apps" } })
      .then(({ data, error }) => {
        if (error || !Array.isArray(data))
          throw error || new Error("My Apps unavailable");
        setItems(data);
      })
      .catch(() =>
        setError("Your apps could not be loaded right now. Please try again."),
      )
      .finally(() => setLoading(false));
  }, []);
  return (
    <main className="mx-auto max-w-4xl px-5 pb-24 pt-10 text-neutral-900 sm:px-8 sm:pt-14">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-sky-800">
            Your software
          </p>
          <h1 className="mt-3 font-display text-4xl sm:text-5xl">Your Apps</h1>
          <p className="mt-2 text-neutral-600">
            Manage the apps you have brought to Rocket.
          </p>
        </div>
        <Link
          to="/submit"
          className="inline-flex min-h-11 items-center rounded-xl bg-neutral-900 px-4 text-sm font-semibold text-white transition hover:bg-neutral-700"
        >
          Submit your app
        </Link>
      </div>
      {loading && (
        <div
          role="status"
          aria-label="Loading your apps"
          className="mt-8 space-y-3"
        >
          {[0, 1].map((item) => (
            <div
              key={item}
              className="rocket-skeleton-surface h-36 animate-pulse rounded-[1.5rem] border border-neutral-200 p-5"
            >
              <div className="h-14 w-14 rounded-2xl bg-neutral-100" />
            </div>
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
      {notice && (
        <p role="status" className="mt-5 text-sm text-green-700">
          {notice}
        </p>
      )}
      {!loading && !error && !items.length && (
        <div className="mt-8 rounded-2xl border bg-white p-8">
          <p>
            No apps here yet. Add yours to claim its listing and show visitors
            what you have built.
          </p>
          <Link
            to="/submit"
            className="mt-3 inline-block font-medium text-sky-700"
          >
            Submit your first app
          </Link>
        </div>
      )}
      {!loading && !error && (
        <div className="mt-7 space-y-3">
          {items.map((item) => (
            <div
              key={item.id}
              className="rounded-[1.5rem] border border-neutral-200 bg-white p-5 shadow-[0_14px_36px_-34px_rgba(15,23,42,0.35)] sm:p-6"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <AppLogo
                    name={item.app?.name || "App under review"}
                    src={item.app?.logo_url}
                    className="h-14 w-14"
                  />
                  <div className="min-w-0">
                    <h2 className="line-clamp-1 font-semibold text-neutral-950">
                      {item.app?.name || "App under review"}
                    </h2>
                    <p className="max-w-[16rem] truncate text-sm text-neutral-500 sm:max-w-md">
                      {item.app?.website_url || "Private submission"}
                    </p>
                  </div>
                </div>
                <span className="rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1 text-xs font-medium text-neutral-700">
                  {item.owned
                    ? item.owner_verification_level === "domain_verified"
                      ? "Domain verified"
                      : "Claimed"
                    : item.status === "review"
                      ? "Review pending"
                      : "Claim pending"}
                </span>
              </div>
              <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 border-t border-neutral-100 pt-4 text-sm">
                {item.owned && <Link to={`/my-apps/${item.app_id}/rocket-analytics`} className="inline-flex items-center gap-2 font-semibold text-sky-800 hover:underline"><BarChart3 size={18} aria-hidden="true" />Rocket Analytics</Link>}
                <Link
                  to={`/apps/add?app=${item.app_id}`}
                  className="font-medium text-sky-800 hover:underline"
                >
                  Manage claim
                </Link>
                {item.app && (
                  <Link
                    to={`/apps/${item.app_id}`}
                    className="font-medium text-sky-800 hover:underline"
                  >
                    View public profile
                  </Link>
                )}
                {item.owned &&
                  item.owner_verification_level === "domain_verified" && (
                    <Link
                      to={`/my-apps/${item.app_id}/edit`}
                      className="font-medium text-sky-800 hover:underline"
                    >
                      Edit profile
                    </Link>
                  )}
              </div>
              {item.owned && <DeveloperProductCards appId={item.app_id} />}
              <AppJourney item={item} />
              <AppDisconnectControls item={item} onDisconnected={() => {
                setItems((current) => current.filter((app) => app.app_id !== item.app_id));
                setNotice("App disconnected from your account. Its public listing has been preserved.");
              }} />
              {item.owned && (
                <div className="mt-4 text-sm">
                  <button
                    onClick={() => {
                      setSourceFor(
                        sourceFor === item.app_id ? null : item.app_id,
                      );
                      setError("");
                    }}
                    className="text-neutral-500 hover:text-sky-700"
                  >
                    {sourceFor === item.app_id
                      ? "Hide source options"
                      : "More options · Add public source"}
                  </button>
                  {sourceFor === item.app_id && (
                    <form
                      className="mt-3 flex gap-2"
                      onSubmit={async (event) => {
                        event.preventDefault();
                        setError("");
                        setNotice("");
                        const { data, error: requestError } =
                          await supabase.functions.invoke("rocket-apps", {
                            body: {
                              action: "add_source",
                              app_id: item.app_id,
                              url: sourceUrl,
                            },
                          });
                        if (requestError || data?.error)
                          setError(
                            data?.error ||
                              requestError?.message ||
                              "Could not attach source",
                          );
                        else {
                          setNotice(
                            data?.outcome === "already_attached"
                              ? "Source already attached."
                              : "Source attached to your app.",
                          );
                          setSourceFor(null);
                          setSourceUrl("");
                        }
                      }}
                    >
                      <input
                        type="url"
                        required
                        value={sourceUrl}
                        onChange={(event) => setSourceUrl(event.target.value)}
                        placeholder="https://public-source-url"
                        className="min-w-0 flex-1 rounded-lg border px-3 py-2"
                      />
                      <button className="rounded-lg bg-neutral-900 px-3 py-2 text-white">
                        Add
                      </button>
                    </form>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <p className="mt-8 text-sm text-neutral-500">
        Manage your Rocket Developer membership in Settings.{" "}
        <Link
          to="/settings/developer"
          className="font-medium text-sky-700 hover:underline"
        >
          View Developer subscription
        </Link>
        .
      </p>
    </main>
  );
}
