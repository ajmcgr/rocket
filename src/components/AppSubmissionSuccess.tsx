import { useEffect, useState } from "react";
import { Link } from "@/lib/router-compat";
import { useAuth } from "@/contexts/AuthContext";
import { loadMyApps } from "@/lib/myApps";
import type { MyApp } from "@/components/AppJourney";
import DeveloperActivationNextSteps from "@/components/DeveloperActivationNextSteps";
import RocketShare from "@/components/RocketShare";

export default function AppSubmissionSuccess({
  appId,
  slug,
  name,
  onViewApp,
}: {
  appId: string;
  slug?: string | null;
  name: string;
  onViewApp: () => void;
}) {
  const { user, loading: authLoading } = useAuth();
  const userId = user?.id;
  const [access, setAccess] = useState<{
    userId: string;
    appId: string;
    item: MyApp | null;
    failed?: boolean;
  } | null>(null);

  useEffect(() => {
    let active = true;
    setAccess(null);
    if (authLoading || !userId) return;
    // Reuse the authenticated, server-checked management list. The success
    // marker is presentation only and never establishes app ownership.
    loadMyApps().then(
      (items) => {
        if (active)
          setAccess({
            userId,
            appId,
            item: items.find((item) => item.app_id === appId) || null,
          });
      },
      () => {
        if (active) setAccess({ userId, appId, item: null, failed: true });
      },
    );
    return () => {
      active = false;
    };
  }, [appId, userId, authLoading]);

  const current =
    !authLoading && access?.userId === userId && access?.appId === appId
      ? access
      : null;
  const owned =
    current?.item?.owned === true &&
    ["claimed", "domain_verified"].includes(
      current.item.owner_verification_level || "",
    );
  const ctaClass =
    "inline-flex min-h-11 items-center justify-center rounded-xl bg-[#167ac6] px-5 py-2 text-sm font-semibold text-white hover:bg-[#1268aa] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#167ac6]";

  return (
    <section
      aria-label="App published"
      className="mt-5 rounded-2xl border border-sky-200 bg-white p-5 sm:p-6"
    >
      <h2 className="text-xl font-bold sm:text-2xl" aria-live="polite">
        Your app is live on Rocket!
      </h2>
      <p className="mt-1 text-sm text-neutral-600">
        Your app is now discoverable. Choose an optional next step.
      </p>
      {current && !current.failed && <DeveloperActivationNextSteps appId={appId} item={current.item} />}
      <h3 className="mt-4 font-semibold">Sell your app with Buy with Rocket</h3>
      <p className="mt-1 max-w-2xl text-sm text-neutral-600">
        Accept payments for app access and subscriptions through Rocket or your
        own website.
      </p>
      {current && !current.failed && !owned && (
        <p className="mt-2 text-sm text-neutral-600">
          Verify your app ownership to enable monetization.
        </p>
      )}
      {current?.failed && (
        <p className="mt-2 text-sm text-neutral-600">
          We couldn’t confirm ownership right now. Check your app in My Apps to
          continue.
        </p>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {owned ? (
          <Link
            to={`/buy-with-rocket?app=${encodeURIComponent(appId)}`}
            className={ctaClass}
          >
            Set up monetization
          </Link>
        ) : current && !current.failed ? (
          <Link
            to={`/apps/add?app=${encodeURIComponent(appId)}`}
            className={ctaClass}
          >
            Verify ownership
          </Link>
        ) : current?.failed ? (
          <Link to="/your-apps" className={ctaClass}>
            My Apps
          </Link>
        ) : null}
        <button
          type="button"
          className="min-h-11 rounded-xl border border-neutral-200 px-5 py-2 text-sm font-medium"
          onClick={onViewApp}
        >
          View your app
        </button>
        <RocketShare
          kind="app"
          identifier={slug || appId}
          title={name}
          label="Share your app"
          className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-sky-800 hover:underline"
        />
      </div>
    </section>
  );
}
