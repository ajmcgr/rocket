import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import AppJourney, { type MyApp } from "@/components/AppJourney";
import AppLogo from "@/components/AppLogo";
import DeveloperProductCards from "@/components/DeveloperProductCards";
import AppDisconnectControls from "@/components/AppDisconnectControls";
import AppAnalyticsPreview from "@/components/AppAnalyticsPreview";
import AppBadgeKit from "@/components/AppBadgeKit";
import GitHubBuildInfo from "@/components/GitHubBuildInfo";
import RocketBetaPanel from "@/components/RocketBetaPanel";
import RocketImprovePanel from "@/components/RocketImprovePanel";
import { useAuth } from "@/contexts/AuthContext";
import { loadMyApps, myAppStatus } from "@/lib/myApps";
import { BarChart3 } from "lucide-react";

export default function MyAppSettings() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const userId = user?.id;
  const [loaded, setLoaded] = useState<{
    owner: string;
    item: MyApp | null;
  } | null>(null);
  const item = loaded && loaded.owner === userId ? loaded.item : null;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sourceOpen, setSourceOpen] = useState(false);
  const [sourceUrl, setSourceUrl] = useState("");
  const [buildRefresh, setBuildRefresh] = useState(0);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    let active = true;
    setLoaded(null);
    setError("");
    setLoading(true);
    if (authLoading)
      return () => {
        active = false;
      };
    if (!userId || !id) {
      setLoading(false);
      return () => {
        active = false;
      };
    }
    loadMyApps()
      .then((items) => {
        if (active)
          setLoaded({
            owner: userId,
            item: items.find((entry) => entry.app_id === id) || null,
          });
      })
      .catch(() => {
        if (active)
          setError(
            "App settings could not be loaded right now. Please try again.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id, userId, authLoading]);
  return (
    <main className="mx-auto max-w-4xl px-5 pb-24 pt-10 text-neutral-900 sm:px-8 sm:pt-14">
      <Link
        to="/your-apps"
        className="text-sm font-medium text-sky-800 hover:underline"
      >
        ← My Apps
      </Link>
      <h1 className="mt-4 font-display text-4xl sm:text-5xl">
        {item?.app?.name || "App settings"}
      </h1>
      <p className="mt-2 text-neutral-600">Manage your app on Rocket.</p>
      {loading && (
        <div
          role="status"
          aria-label="Loading app settings"
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
      {!loading && !error && !item && (
        <div className="mt-8 rounded-2xl border bg-white p-8">
          <p>This app is not available in your account.</p>
          <Link
            to="/your-apps"
            className="mt-3 inline-block font-medium text-sky-700"
          >
            Back to My Apps
          </Link>
        </div>
      )}
      {!loading && !error && item && (
        <div className="mt-7 space-y-3">
          {item.owned && <nav aria-label="App developer toolkit" className="flex flex-wrap gap-2 pb-2 text-sm font-medium">
            {[["Overview", "overview"], ["Analytics", "analytics"], ["Improve", "improve"], ["Beta", "beta"], ["Verification", "verification"], ["Monetize", "monetize"]].map(([label, anchor]) => <a key={anchor} href={`#${anchor}`} className="rounded-full border border-neutral-200 bg-white px-3 py-2 text-neutral-700 hover:border-sky-300 hover:text-sky-800">{label}</a>)}
          </nav>}
          <div
            key={item.id}
            id="overview"
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
                {myAppStatus(item)}
              </span>
            </div>
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 border-t border-neutral-100 pt-4 text-sm">
              {item.owned && (
                <Link
                  to={`/my-apps/${item.app_id}/rocket-analytics`}
                  className="inline-flex items-center gap-2 font-semibold text-sky-800 hover:underline"
                >
                  <BarChart3 size={18} aria-hidden="true" />
                  Analytics
                </Link>
              )}
              <Link
                to={`/apps/add?app=${item.app_id}`}
                className="font-medium text-sky-800 hover:underline"
              >
                Manage claim
              </Link>
              {item.app && (
                <Link
                  to={`/apps/${item.app?.slug || item.app_id}`}
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
            <div id="verification"><AppJourney item={item} /></div>
            {item.owned &&
              item.owner_verification_level === "domain_verified" && (
                <GitHubBuildInfo
                  appId={item.app_id}
                  refresh={buildRefresh}
                  onAddSource={() => setSourceOpen(true)}
                />
              )}
            {item.owned && (
              <div className="mt-4 text-sm">
                <button
                  onClick={() => {
                    setSourceOpen((current) => !current);
                    setError("");
                  }}
                  className="text-neutral-500 hover:text-sky-700"
                >
                  {sourceOpen
                    ? "Hide source options"
                    : "More options · Add public source"}
                </button>
                {sourceOpen && (
                  <form
                    className="mt-3 flex flex-wrap gap-2"
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
                        setSourceOpen(false);
                        setSourceUrl("");
                        setBuildRefresh((current) => current + 1);
                      }
                    }}
                  >
                    <input
                      type="url"
                      required
                      value={sourceUrl}
                      onChange={(event) => setSourceUrl(event.target.value)}
                      placeholder="https://github.com/owner/repository"
                      aria-label="Public source URL"
                      className="min-w-0 flex-1 rounded-lg border px-3 py-2"
                    />
                    <button className="rounded-lg bg-neutral-900 px-3 py-2 text-white">
                      Add
                    </button>
                  </form>
                )}
              </div>
            )}
            {item.owned && <div id="analytics">
              <AppAnalyticsPreview
                appId={item.app_id}
                appName={item.app?.name || "App"}
              />
            </div>}
            {item.owned && item.owner_verification_level === "domain_verified" && <RocketImprovePanel appId={item.app_id} />}
            {item.owned && item.owner_verification_level === "domain_verified" && <RocketBetaPanel appId={item.app_id} appName={item.app?.name || "App"} />}
            {item.owned && <div id="monetize"><DeveloperProductCards appId={item.app_id} /></div>}
            {item.owned && item.app && (
              <AppBadgeKit
                appId={item.app_id}
                appSlug={item.app.slug}
                appName={item.app.name || "your app"}
              />
            )}
            <AppDisconnectControls
              item={item}
              onDisconnected={() => {
                navigate("/your-apps");
              }}
            />
          </div>
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
