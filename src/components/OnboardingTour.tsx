import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "@/lib/router-compat";
import { useAuth } from "@/contexts/AuthContext";
import { loadMyApps } from "@/lib/myApps";
import type { MyApp } from "./AppJourney";
import { supabase } from "@/integrations/supabase/client";
import { track } from "@/lib/analytics";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import {
  ONBOARDING_STORAGE_KEY,
  canShowOnboarding,
  eligibleOnboardingApps,
  onboardingDestination,
  onboardingSteps,
  type OnboardingIntent,
} from "@/lib/onboarding";

const primary =
  "inline-flex min-h-11 items-center justify-center rounded-xl bg-[#167ac6] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1268aa] disabled:opacity-50";
const secondary =
  "inline-flex min-h-11 items-center justify-center rounded-xl border border-neutral-200 px-4 py-2 text-sm font-medium hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800";

// This is the existing tour, still using its original per-account completion key
// and launch event. Intent is temporary React state, never profile metadata.
export default function OnboardingTour() {
  const { user, loading } = useAuth();
  const location = useLocation();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);
  const [intent, setIntent] = useState<OnboardingIntent | null>(null);
  const [owner, setOwner] = useState<string | null>(null);
  const [apps, setApps] = useState<MyApp[]>([]);
  const [appsLoading, setAppsLoading] = useState(false);
  const [appsError, setAppsError] = useState(false);
  const [providers, setProviders] = useState<string[]>([]);
  const [selectedApp, setSelectedApp] = useState("");
  const started = useRef(false);
  const viewed = useRef(-1);
  const userId = user?.id;
  const safe = canShowOnboarding(
    location.pathname,
    location.search,
    location.hash,
  );
  const currentApps = owner === userId ? apps : [];
  const eligible = eligibleOnboardingApps(currentApps);
  const eligibleId =
    eligible.find((item) => item.app_id === selectedApp)?.app_id ||
    eligible[0]?.app_id;
  const step = onboardingSteps[idx];

  useEffect(() => {
    setOpen(false);
    setIdx(0);
    setIntent(null);
    setApps([]);
    setOwner(null);
    setProviders([]);
    setSelectedApp("");
    started.current = false;
    viewed.current = -1;
  }, [userId]);
  useEffect(() => {
    if (!userId || !user?.email_confirmed_at || loading || !safe) {
      setOpen(false);
      return;
    }
    try {
      if (sessionStorage.getItem("rocket:founder-claim-invitation")) return;
      if (localStorage.getItem(`${ONBOARDING_STORAGE_KEY}.${userId}`)) return;
      const created = Date.parse(user?.created_at || "");
      if (
        !Number.isFinite(created) ||
        created > Date.now() ||
        Date.now() - created >= 7 * 86400000
      ) {
        localStorage.setItem(`${ONBOARDING_STORAGE_KEY}.${userId}`, "1");
        return;
      }
    } catch {
      return;
    } // Unavailable storage must not cause an unavoidable replay.
    const timer = setTimeout(() => setOpen(true), 600);
    return () => clearTimeout(timer);
  }, [userId, user?.created_at, user?.email_confirmed_at, loading, safe]);
  useEffect(() => {
    const launch = () => {
      if (!userId || loading || !safe) return;
      setIdx(0);
      setIntent(null);
      setSelectedApp("");
      started.current = false;
      viewed.current = -1;
      setOpen(true);
    };
    window.addEventListener("rocket:start-tour", launch);
    return () => window.removeEventListener("rocket:start-tour", launch);
  }, [userId, loading, safe]);
  useEffect(() => {
    if (
      !userId ||
      loading ||
      !safe ||
      location.hash.replace(/^#/, "") !== "onboarding"
    )
      return;
    setIdx(0);
    setIntent(null);
    started.current = false;
    viewed.current = -1;
    setOpen(true);
    nav("/settings/profile", { replace: true });
  }, [userId, loading, safe, location.hash, nav]);
  useEffect(() => {
    if (!open || !safe || !userId) return;
    if (!started.current) {
      track("onboarding_started");
      started.current = true;
    }
    if (viewed.current !== idx) {
      track("onboarding_step_viewed", { step });
      viewed.current = idx;
    }
  }, [open, safe, userId, idx, step]);
  useEffect(() => {
    if (!open || !userId) return;
    let alive = true;
    setAppsLoading(true);
    setAppsError(false);
    loadMyApps()
      .then((items) => {
        if (alive) {
          setOwner(userId);
          setApps(items);
        }
      })
      .catch(() => {
        if (alive) {
          setOwner(userId);
          setApps([]);
          setAppsError(true);
        }
      })
      .finally(() => {
        if (alive) setAppsLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [open, userId]);
  useEffect(() => {
    setProviders([]);
    if (!open || idx !== 4 || !eligibleId || intent === "exploring") return;
    let alive = true;
    void Promise.all(
      [
        ["RevenueCat", "rocket-revenuecat", {}],
        ["Polar", "rocket-alternative-revenue", { provider: "polar" }],
        ["Dodo Payments", "rocket-alternative-revenue", { provider: "dodo" }],
      ].map(async ([name, endpoint, extra]) => {
        try {
          const { data, error } = await supabase.functions.invoke(
            String(endpoint),
            {
              body: {
                action: "status",
                app_id: eligibleId,
                ...(extra as object),
              },
            },
          );
          return !error && !data?.error && data?.connect_available === true
            ? String(name)
            : null;
        } catch {
          return null;
        }
      }),
    ).then((names) => {
      if (alive)
        setProviders(names.filter((name): name is string => Boolean(name)));
    });
    return () => {
      alive = false;
    };
  }, [open, idx, eligibleId, intent]);

  const finish = (completed: boolean, reason = "skip") => {
    try {
      if (userId)
        localStorage.setItem(`${ONBOARDING_STORAGE_KEY}.${userId}`, "1");
    } catch {
      /* keep usable */
    }
    track(completed ? "onboarding_completed" : "onboarding_skipped", {
      step,
      reason,
      intent: intent || "undecided",
    });
    setOpen(false);
  };
  const go = (to: string, action: string) => {
    track("onboarding_primary_cta_clicked", {
      step,
      action,
      intent: intent || "undecided",
    });
    finish(idx === 6, "primary_cta");
    nav(to);
  };
  const next = () => {
    track("onboarding_primary_cta_clicked", { step, action: "continue" });
    setIdx((value) => Math.min(6, value + 1));
  };
  const titles = [
    "Welcome to Rocket.",
    "What brings you to Rocket?",
    intent === "exploring" ? "Find your next app." : "Choose your app journey.",
    "Your developer profile.",
    "Showcase real traction behind your apps.",
    "Grow and monetize.",
    "You’re ready.",
  ];
  const descriptions = [
    "Discover apps. Grow and monetize yours.",
    "Choose what fits today. You can change direction any time.",
    intent === "exploring"
      ? "Search, browse categories and save software you want to try."
      : "Add something new, claim an existing listing, or manage an app you already own. Claiming is free; ownership still needs verification.",
    "Your profile gives people a way to discover you and the software you build.",
    "Verification is optional. Connect a supported provider when your app is ready.",
    "Tools to help the right people find and use what you build. There’s no need to upgrade now.",
    intent === "exploring"
      ? "Explore the catalogue and save your discoveries."
      : "Build at your own pace. You don’t need to publish or own an app to use Rocket.",
  ];
  const destination = onboardingDestination(intent, currentApps);
  if (!userId || loading || !safe) return null;
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value && open) finish(false, "dismissed");
      }}
    >
      <DialogContent
        motion="gentle"
        showCloseButton={false}
        className="z-[1000002] max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-xl overflow-y-auto rounded-2xl border-neutral-200 bg-white p-5 text-neutral-900 sm:p-7 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
        aria-label="Onboarding tour"
      >
        <div className="flex items-center justify-between gap-3 text-xs text-neutral-500 dark:text-neutral-400">
          <span>Step {idx + 1} of 7</span>
          <button
            onClick={() => finish(false)}
            className="min-h-11 px-2 text-sm"
          >
            Skip onboarding
          </button>
        </div>
        <DialogTitle className="text-2xl font-bold leading-tight">
          {titles[idx]}
        </DialogTitle>
        <DialogDescription className="text-sm leading-6 text-neutral-600 dark:text-neutral-300">
          {descriptions[idx]}
        </DialogDescription>
        {idx === 0 && (
          <>
            <p className="text-sm leading-6">
              Find useful software, meet its makers and save apps to try. If
              you’re building, give your app a home, show your work and reach
              new users.
            </p>
            <img
              src="/tour/rocket-home.png"
              alt="Rocket app discovery"
              width={960}
              height={570}
              className="aspect-video w-full rounded-xl border border-neutral-200 object-cover object-top"
            />
          </>
        )}
        {idx === 1 && (
          <div role="group" aria-label="Your intent" className="grid gap-3">
            {(
              [
                ["building", "I'm building an app"],
                ["built", "I've already built an app"],
                ["exploring", "I'm exploring apps"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                aria-pressed={intent === value}
                onClick={() => {
                  setIntent(value);
                  track("onboarding_intent_selected", { intent: value });
                }}
                className={`${secondary} justify-start text-left ${intent === value ? "border-[#167ac6] bg-sky-50 text-sky-900 dark:bg-sky-950 dark:text-sky-100" : ""}`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        {idx === 2 &&
          (intent === "exploring" ? (
            <button
              className={secondary}
              onClick={() => go("/discover", "explore")}
            >
              Explore Discover →
            </button>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                className={secondary}
                onClick={() => go("/submit", "add_app")}
              >
                Add a new app
              </button>
              <button
                className={secondary}
                onClick={() => go("/discover", "find_claim_app")}
              >
                Claim an existing app
              </button>
              <button
                className={secondary}
                onClick={() => go("/your-apps", "manage_apps")}
              >
                Manage my apps
              </button>
              <button className={secondary} onClick={() => setIdx(3)}>
                Skip for now
              </button>
            </div>
          ))}
        {idx === 3 && (
          <div className="space-y-3">
            <p className="text-sm leading-6">
              Add your name, a bio and links when you’re ready. A public profile
              is useful even before you publish an app.
            </p>
            <button
              className={secondary}
              onClick={() => go("/settings/profile", "complete_profile")}
            >
              Complete profile
            </button>
            <button
              className="ml-3 min-h-11 text-sm underline"
              onClick={() => setIdx(4)}
            >
              Skip for now
            </button>
          </div>
        )}
        {idx === 4 && (
          <div className="space-y-4 text-sm leading-6">
            <p>
              <strong>Analytics:</strong> Google Analytics or PostHog.
            </p>
            <p>
              <strong>Revenue:</strong>{" "}
              {providers.length
                ? providers.join(", ")
                : "Supported revenue verification is available in eligible app settings. Availability depends on the provider."}
            </p>
            <p>
              Stripe Revenue Verification · <strong>Available for domain-verified app owners</strong>
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                Connections require eligible, domain-verified app ownership.
              </li>
              <li>
                Metrics are private by default. You choose supported public
                visibility: private, verified only, a range or an exact value,
                where supported.
              </li>
              <li>
                Select only one analytics provider and one revenue provider per
                app.
              </li>
            </ul>
            {intent !== "exploring" && eligibleId ? (
              <div className="space-y-3">
                {eligible.length > 1 && (
                  <label className="block">
                    Your app
                    <select
                      aria-label="App for verification"
                      value={eligibleId}
                      onChange={(event) => setSelectedApp(event.target.value)}
                      className="mt-1 w-full rounded-xl border border-neutral-200 bg-white p-3 dark:bg-neutral-900 dark:border-neutral-700"
                    >
                      {eligible.map((item) => (
                        <option key={item.app_id} value={item.app_id}>
                          {item.app?.name || "My app"}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <div className="flex flex-wrap gap-2">
                  <button
                    className={secondary}
                    onClick={() =>
                      go(
                        `/my-apps/${encodeURIComponent(eligibleId)}/analytics`,
                        "analytics_settings",
                      )
                    }
                  >
                    Traffic verification settings
                  </button>
                  <button
                    className={secondary}
                    onClick={() =>
                      go(
                        `/my-apps/${encodeURIComponent(eligibleId)}/revenue`,
                        "revenue_settings",
                      )
                    }
                  >
                    Revenue verification settings
                  </button>
                </div>
              </div>
            ) : (
              <p>
                {appsLoading
                  ? "Checking your apps…"
                  : appsError
                    ? "We couldn’t check your eligible apps right now. You can continue and check My Apps later."
                    : "Once you own and verify an eligible app’s domain, its verification settings become available in My Apps. You can keep exploring in the meantime."}
              </p>
            )}
          </div>
        )}
        {idx === 5 && (
          <ul className="space-y-3 text-sm leading-6">
            <li>
              <strong>Rocket Developer:</strong> optional membership for
              eligible developer tools. Basic app submission, claiming and
              management stay free.
            </li>
            <li>
              <strong>Buy with Rocket:</strong> let customers choose a published
              plan and purchase through supported checkout. It requires separate
              verified ownership, merchant and integration setup; Developer
              membership alone does not activate checkout.
            </li>
            <li>
              <strong>Featured App advertising:</strong> paid placements that
              put your listing in front of people discovering apps.
            </li>
            <li>
              <strong>Category sponsorship:</strong> reach visitors browsing a
              relevant category. Availability and terms are shown before
              purchase.
            </li>
          </ul>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-200 pt-4 dark:border-neutral-700">
          {idx > 0 ? (
            <button
              className={secondary}
              onClick={() => setIdx((value) => value - 1)}
            >
              Back
            </button>
          ) : (
            <span />
          )}
          {idx === 6 ? (
            <div className="flex flex-wrap gap-2">
              <button
                className={secondary}
                onClick={() => go("/dashboard", "dashboard")}
              >
                Go to dashboard
              </button>
              <button
                className={primary}
                onClick={() => go(destination.to, destination.action)}
              >
                {destination.label} →
              </button>
            </div>
          ) : (
            <button
              disabled={idx === 1 && !intent}
              className={primary}
              onClick={next}
            >
              {idx === 0 ? "Get started" : "Continue"} →
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
