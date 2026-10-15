import { useEffect, useState } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "@/lib/router-compat";
import SiteHeader from "@/components/SiteHeader";
import AppMarketplaceContext from "@/components/AppMarketplaceContext";
import { recordOutbound, sourceAttribution } from "@/lib/marketplace";
import { useDocumentMeta } from "@/hooks/useDocumentMeta";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { useAuth } from "@/contexts/AuthContext";
import SaveAppButton from "@/components/SaveAppButton";
import AppProfileBuyAction from "@/components/AppProfileBuyAction";
import RocketBetaJoin from "@/components/RocketBetaJoin";
import {
  signalExplanation,
  signalLabel,
  type AppSignal,
} from "@/lib/appIntelligence";
import AppTrustBadges from "@/components/AppTrustBadges";
import AppLogo from "@/components/AppLogo";
import type { AppTrust } from "@/lib/appTrust";
import { trustLabels } from "@/lib/appTrust";
import { track } from "@/lib/analytics";
import { loadAppMedia, type PublicAppMedia } from "@/lib/appMedia";
import AppMediaGallery from "@/components/AppMediaGallery";
import PublicMetricCard, {
  publicTrafficValue,
  publicRevenueValue,
} from "@/components/PublicMetricCard";
import { featuredTraffic, featuredRevenue } from "@/lib/publicAppEvidence";
import { Users, Eye, BarChart3, DollarSign } from "lucide-react";
import { AppProfileContentSkeleton } from "@/components/MarketplaceLoadingSkeletons";
import AppReviews from "@/components/AppReviews";
import { MarketplaceListRow } from "@/components/MarketplaceCards";
import { useSavedAppControls } from "@/hooks/useSavedAppControls";
import {
  loadAppCardMetadata,
  type AppCardMetadata,
} from "@/lib/appCardMetadata";
import TrendArrow from "@/components/TrendArrow";
import {
  SUBMISSION_PLATFORMS,
  type SubmissionDetails,
} from "../../supabase/functions/_shared/appSubmission";
import RocketShare from "@/components/RocketShare";
import { shareCardUrl, shareCardVersion } from "@/lib/shareLinks";
import AppAgentIntegrations, { type PublicAgentIntegrations } from "@/components/AppAgentIntegrations";

type App = Tables<"public_apps">;
type Source = Tables<"public_app_sources">;
type Traction = Tables<"public_app_traction">;
type Revenue = Tables<"public_app_revenue">;
type AlternativeRevenue = Tables<"public_app_verified_revenue">;
const date = (value: string | null) =>
  value
    ? new Date(value).toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "Not available";
const descriptionSummary = (description: string) => {
  const firstParagraph = description.trim().split(/\n\s*\n/)[0];
  return firstParagraph.length > 360
    ? `${firstParagraph.slice(0, 360).replace(/\s+\S*$/, "")}…`
    : firstParagraph;
};
const linkHost = (value: string) => {
  try {
    return new URL(value).hostname;
  } catch {
    return "External link";
  }
};

export default function PublicAppProfile({
  initialApp,
  initialMedia,
}: { initialApp?: App | null; initialMedia?: PublicAppMedia[] } = {}) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const sponsorId = searchParams.get("sponsor");
  const saveAfterAuth = searchParams.get("save") === "1";
  const { user } = useAuth();
  const [app, setApp] = useState<App | null>(initialApp || null);
  const [sources, setSources] = useState<Source[]>([]);
  const [agentIntegration, setAgentIntegration] = useState<PublicAgentIntegrations | null>(null);
  const [traction, setTraction] = useState<Traction[]>([]);
  const [revenue, setRevenue] = useState<Revenue[]>([]);
  const [alternativeRevenue, setAlternativeRevenue] = useState<
    AlternativeRevenue[]
  >([]);
  const [signals, setSignals] = useState<AppSignal[]>([]);
  const [trust, setTrust] = useState<AppTrust | null>(null);
  const [media, setMedia] = useState<PublicAppMedia[]>(initialMedia || []);
  const [similar, setSimilar] = useState<App[]>([]);
  const similarSaveControls = useSavedAppControls(
    similar.map((item) => item.id),
  );
  const [similarMetadata, setSimilarMetadata] = useState<
    Map<string, AppCardMetadata>
  >(new Map());
  const [reviewSummary, setReviewSummary] = useState<{
    rating_count: number;
    average_rating: number;
  } | null>(null);
  const [presentation, setPresentation] = useState<{
    pricing_display: string | null;
    public_links: string[];
  } | null>(null);
  const [saved, setSaved] = useState(false);
  const [submission, setSubmission] = useState<SubmissionDetails | null>(null);
  const [justPublished, setJustPublished] = useState(false);
  const [loading, setLoading] = useState(initialApp === undefined);
  const [error, setError] = useState(initialApp === null);
  useEffect(() => {
    if (!app?.id) return;
    try {
      if (sessionStorage.getItem("rocket:just-published") === app.id) {
        sessionStorage.removeItem("rocket:just-published");
        setJustPublished(true);
      }
    } catch { /* Sharing remains available in private browsing modes. */ }
  }, [app?.id]);
  useDocumentMeta({
    title: app ? `${app.name} | Rocket` : "App profile | Rocket",
    description:
      app?.tagline ||
      (app?.description
        ? descriptionSummary(app.description).slice(0, 180)
        : "Explore a public app listed on Rocket."),
    canonical: app
      ? `https://tryrocket.ai/apps/${app.slug || app.id}`
      : undefined,
    image: app ? shareCardUrl("app", app.slug || app.id, "landscape", shareCardVersion(app.name, app.tagline, app.description, app.logo_url, media.map((item) => item.source_url))) : undefined,
  });

  useEffect(() => {
    let canceled = false;
    let coreReady = false;
    const matchesInitial =
      initialApp && (initialApp.id === id || initialApp.slug === id);
    setLoading(!matchesInitial);
    setError(false);
    if (!id) {
      setLoading(false);
      setError(true);
      return;
    }
    const load = async () => {
      const isId = /^[0-9a-f-]{36}$/i.test(id);
      const appResult = matchesInitial
        ? { data: initialApp, error: null }
        : await supabase
            .from("public_apps")
            .select("*")
            .eq(isId ? "id" : "slug", id)
            .maybeSingle();
      if (canceled) return;
      if (appResult.error || !appResult.data) {
        setApp(null);
        setError(true);
        setLoading(false);
        return;
      }
      const appId = appResult.data.id;
      coreReady = true;
      setApp(appResult.data);
      setLoading(false);
      // Core identity/description/CTAs render before optional evidence/media.
      setSources([]);
      setAgentIntegration(null);
      setTraction([]);
      setRevenue([]);
      setAlternativeRevenue([]);
      setSignals([]);
      setTrust(null);
      setMedia(matchesInitial ? initialMedia || [] : []);
      setPresentation(null);
      setSubmission(null);
      const [
        sourceResult,
        tractionResult,
        revenueResult,
        alternativeRevenueResult,
        signalResult,
        trustResult,
        mediaResult,
        presentationResult,
        submissionResult,
        agentIntegrationResult,
      ] = await Promise.all([
        supabase.from("public_app_sources").select("*").eq("app_id", appId),
        supabase.from("public_app_traction").select("*").eq("app_id", appId),
        supabase.from("public_app_revenue").select("*").eq("app_id", appId),
        supabase
          .from("public_app_verified_revenue")
          .select("*")
          .eq("app_id", appId),
        supabase
          .from("public_app_intelligence")
          .select("*")
          .eq("app_id", appId),
        supabase
          .from("public_app_trust")
          .select("*")
          .eq("app_id", appId)
          .maybeSingle(),
        matchesInitial && initialMedia !== undefined
          ? Promise.resolve(new Map([[appId, initialMedia]]))
          : loadAppMedia([appId], false),
        supabase
          .from("public_app_presentation")
          .select("pricing_display,public_links")
          .eq("app_id", appId)
          .maybeSingle(),
        supabase
          .from("public_app_submission_details")
          .select("details")
          .eq("app_id", appId)
          .maybeSingle(),
        supabase.from("app_agent_integrations")
          .select("mcp_url,api_docs_url,github_url,deployment_url,supported_clients")
          .eq("app_id", appId).maybeSingle(),
      ]);
      if (canceled) return;
      setApp(appResult.data);
      setSources(sourceResult.data || []);
      setAgentIntegration(agentIntegrationResult.data || null);
      setTraction(tractionResult.data || []);
      setRevenue(revenueResult.data || []);
      setAlternativeRevenue(alternativeRevenueResult.data || []);
      setSignals(signalResult.data || []);
      setTrust(trustResult.data);
      setMedia(mediaResult.get(appId) || []);
      setPresentation(presentationResult.data || null);
      setSubmission(
        (submissionResult.data?.details as unknown as SubmissionDetails) ||
          null,
      );
      // Optional evidence failures must not hide a valid public profile.
      if (appResult.data && !appResult.error) {
        track("app_profile_viewed", {
          app_id: appResult.data.id,
          source: sponsorId ? "sponsored" : "organic",
        });
        // First-party rankings count real production profile visits only.
        if (
          ["https://tryrocket.ai", "https://www.tryrocket.ai"].includes(
            window.location.origin,
          )
        ) {
          void supabase.functions
            .invoke("rocket-app-view", {
              body: { app_id: appResult.data.id, sponsorship_id: sponsorId, source: sourceAttribution(window.location.search) },
            })
            .catch(() => undefined);
        }
      }
      setLoading(false);
    };
    void load().catch(() => {
      if (!canceled) {
        if (!coreReady) setError(true);
        setLoading(false);
      }
    });
    return () => {
      canceled = true;
    };
  }, [id, initialApp, initialMedia, sponsorId]);

  useEffect(() => {
    if (!app?.categories.length) {
      setSimilar([]);
      return;
    }
    let canceled = false;
    supabase
      .from("public_discoverable_apps")
      .select("*")
      .contains("categories", [app.categories[0]])
      .neq("id", app.id)
      .order("launched_at", { ascending: false, nullsFirst: false })
      .limit(8)
      .then(({ data }) => {
        if (canceled) return;
        const tags = new Set(app.tags);
        setSimilar(
          (data || [])
            .sort((left, right) => {
              const score = (candidate: App) =>
                candidate.tags.filter((tag) => tags.has(tag)).length * 2 +
                candidate.platforms.filter((platform) =>
                  app.platforms.includes(platform),
                ).length;
              return (
                score(right) - score(left) || left.id.localeCompare(right.id)
              );
            })
            .slice(0, 4),
        );
      });
    return () => {
      canceled = true;
    };
  }, [app]);

  useEffect(() => {
    let canceled = false;
    loadAppCardMetadata(similar.map((item) => item.id)).then((result) => {
      if (!canceled) setSimilarMetadata(result);
    });
    return () => {
      canceled = true;
    };
  }, [similar]);

  useEffect(() => {
    if (!app?.id || !user) {
      setSaved(false);
      return;
    }
    let canceled = false;
    const run = async () => {
      if (saveAfterAuth) {
        const result = await supabase
          .from("saved_apps")
          .insert({ user_id: user.id, app_id: app.id });
        if (!canceled && (!result.error || result.error.code === "23505")) {
          setSaved(true);
          if (!result.error)
            track("app_saved", { app_id: app.id, after_auth: true });
          setSearchParams({}, { replace: true });
          return;
        }
        if (!canceled) setSearchParams({}, { replace: true });
      } else {
        const { data } = await supabase
          .from("saved_apps")
          .select("app_id")
          .eq("user_id", user.id)
          .eq("app_id", app.id)
          .maybeSingle();
        if (!canceled) setSaved(Boolean(data));
      }
    };
    run();
    return () => {
      canceled = true;
    };
  }, [app?.id, user, saveAfterAuth, setSearchParams, navigate]);

  const trafficPoint = featuredTraffic(traction);
  const revenuePoint = featuredRevenue(alternativeRevenue, revenue);

  return (
    <div className="marketplace-page min-h-screen bg-[#f6f8fb] text-neutral-900">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-5 pb-20 pt-6 sm:px-8 sm:pt-8">
        <Link
          to="/discover"
          className="inline-flex items-center gap-2 text-sm text-neutral-600 hover:text-sky-700"
        >
          <span aria-hidden="true">←</span>
          Back to Discover
        </Link>
        {loading && (
          <div role="status" aria-label="Loading app profile" aria-busy="true">
            <AppProfileContentSkeleton />
          </div>
        )}
        {error && !loading && (
          <div
            role="alert"
            className="mt-10 rounded-xl border border-neutral-200 bg-white p-8"
          >
            <h1 className="text-2xl font-semibold">App not found</h1>
            <p className="mt-2 text-neutral-600">
              This listing may no longer be public.
            </p>
          </div>
        )}
        {app && !loading && !error && (
          <>
            {justPublished && <div role="status" className="mt-5 rounded-2xl border border-sky-200 bg-white p-5 sm:p-6"><p className="text-xs font-bold uppercase tracking-widest text-sky-700">Your app is on Rocket</p><h2 className="mt-2 text-2xl font-bold">Share what you built.</h2><p className="mt-1 text-sm text-neutral-600">People can now discover and save your app. Sharing is always your choice.</p><div className="mt-4 flex flex-wrap gap-3"><RocketShare kind="app" identifier={app.slug || app.id} title={app.name} label="Share your app" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#167ac6] px-5 text-sm font-semibold text-white" /><button type="button" className="min-h-11 rounded-xl border border-neutral-200 px-5 text-sm font-medium" onClick={() => setJustPublished(false)}>View app</button></div></div>}
            <div className="mt-5 rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm sm:p-7">
              <div className="flex items-start gap-4 sm:gap-6">
                <AppLogo
                  name={app.name}
                  src={app.logo_url}
                  className="h-16 w-16 shrink-0 sm:h-20 sm:w-20"
                  eager
                />
                <div className="min-w-0 flex-1">
                  <h1 className="text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
                    {app.name}
                  </h1>
                  <p className="mt-1 max-w-2xl text-base leading-relaxed text-neutral-600 sm:text-lg">
                    {app.tagline ||
                      (app.description
                        ? descriptionSummary(app.description)
                        : app.canonical_host)}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold">
                    <span className="text-sky-800">
                      {app.categories[0] || "App"}
                    </span>
                    {app.platforms.map((platform) => (
                      <span key={platform} className="text-neutral-600">
                        {SUBMISSION_PLATFORMS.find(({ id }) => id === platform)
                          ?.label || platform}
                      </span>
                    ))}
                  </div>
                  {reviewSummary && (
                    <p className="mt-2 text-sm font-medium text-neutral-700">
                      <span className="text-amber-500">★</span>{" "}
                      {reviewSummary.average_rating} ·{" "}
                      {reviewSummary.rating_count}{" "}
                      {reviewSummary.rating_count === 1 ? "review" : "reviews"}
                    </p>
                  )}
                </div>
              </div>
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <a
                  href={app.website_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => {
                    track("outbound_app_clicked", { app_id: app.id });
                    recordOutbound(app.id);
                  }}
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#167ac6] px-5 py-3 text-sm font-semibold text-white hover:bg-[#1268aa] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#075985]"
                >
                  Visit website <span aria-hidden="true">→</span>
                </a>
                <SaveAppButton
                  appId={app.id}
                  saved={saved}
                  onChange={setSaved}
                />
                <AppProfileBuyAction
                  appId={app.id}
                  appName={app.name}
                  websiteUrl={app.website_url}
                />
                <RocketShare kind="app" identifier={app.slug || app.id} title={app.name} version={shareCardVersion(app.name, app.tagline, app.description, app.logo_url, media.map((item) => item.source_url))} />
                <span className="w-full truncate text-sm text-neutral-500 sm:w-auto">
                  {app.canonical_host}
                </span>
              </div>
              {presentation?.pricing_display && (
                <p className="mt-3 text-xs text-neutral-500">
                  Pricing: {presentation.pricing_display} · Information supplied
                  by the app owner
                </p>
              )}
              {(trafficPoint || revenuePoint) && (
                <div className="mt-6 grid gap-4 border-t border-neutral-200 pt-6 sm:grid-cols-2">
                  {trafficPoint && (
                    <section aria-label="Traffic">
                      <PublicMetricCard
                        label={
                          {
                            active_users: "Daily active users",
                            sessions: "Daily sessions",
                            views: "Daily views",
                          }[trafficPoint.metric_type] ||
                          trafficPoint.metric_type
                        }
                        icon={
                          trafficPoint.metric_type === "active_users"
                            ? Users
                            : trafficPoint.metric_type === "views"
                              ? Eye
                              : BarChart3
                        }
                        value={publicTrafficValue(
                          trafficPoint.visibility,
                          trafficPoint.value,
                          trafficPoint.value_range,
                        )}
                        details={`${trafficPoint.provider === "ga4" ? "Google Analytics" : trafficPoint.provider} · ${trafficPoint.metric_date}`}
                      />
                    </section>
                  )}
                  {revenuePoint && (
                    <section aria-label="Verified revenue">
                      {revenuePoint.source === "alternative" ? (
                        <PublicMetricCard
                          label={
                            revenuePoint.point.metric_type === "gross_revenue_30d"
                              ? `Gross revenue · previous 30 days · ${revenuePoint.point.currency}`
                              : revenuePoint.point.metric_type === "paid_volume_30d"
                                ? `Succeeded payment volume · previous 30 days · ${revenuePoint.point.currency}`
                                : `Subscription MRR · ${revenuePoint.point.currency}`
                          }
                          icon={DollarSign}
                          value={publicRevenueValue(
                            revenuePoint.point.visibility,
                            revenuePoint.point.value_minor,
                            revenuePoint.point.range_lower_minor,
                            revenuePoint.point.range_upper_minor,
                            revenuePoint.point.currency,
                          )}
                          details={`${revenuePoint.point.provider === "revenuecat" ? "RevenueCat" : revenuePoint.point.provider} · Updated ${date(revenuePoint.point.verified_at)}`}
                        />
                      ) : (
                        <PublicMetricCard
                          label={`Monthly recurring revenue · ${revenuePoint.point.currency.toUpperCase()}`}
                          icon={DollarSign}
                          value={publicRevenueValue(
                            revenuePoint.point.visibility,
                            revenuePoint.point.mrr_minor,
                            revenuePoint.point.range_lower_minor,
                            revenuePoint.point.range_upper_minor,
                            revenuePoint.point.currency,
                          )}
                          details={`Stripe · Snapshot ${date(revenuePoint.point.observed_at)}`}
                        />
                      )}
                    </section>
                  )}
                </div>
              )}
              <AppMediaGallery name={app.name} media={media} />
            </div>
            <AppAgentIntegrations integration={agentIntegration}
              linkedGithubUrl={sources.find((source) => source.source_type === "github")?.source_url} />
            <RocketBetaJoin appId={app.id} appSlug={app.slug || app.id} />
            {signals.length > 0 && (
              <section className="mt-8 pb-2">
                <h2 className="text-xl font-semibold tracking-tight">
                  Why it’s interesting
                </h2>
                <div className="mt-4 space-y-4">
                  {signals.map((signal) => (
                    <div key={signal.signal_type}>
                      <p className="flex items-center gap-1 font-medium text-sky-700">
                        {signal.signal_type === "rising" && (
                          <TrendArrow direction="up" />
                        )}
                        {signalLabel(signal)}
                      </p>
                      <p className="mt-1 text-sm text-neutral-700">
                        {signalExplanation(signal)}
                      </p>
                    </div>
                  ))}
                </div>
                <p className="mt-4 text-xs text-neutral-500">
                  Public Launch activity is not verified traffic, revenue, or a
                  Rocket recommendation.
                </p>
              </section>
            )}
            <AppMarketplaceContext key={app.id} appId={app.id} />
            <AppReviews appId={app.id} onSummary={setReviewSummary} />
            {trustLabels(trust).length > 0 && (
              <section className="mt-8 border-t border-neutral-200 pt-6">
                <h2 className="text-xl font-semibold tracking-tight">Trust</h2>
                <div className="mt-4">
                  <AppTrustBadges trust={trust} />
                </div>
                {trust?.domain_verified ? (
                  <p className="mt-3 text-sm text-neutral-600">
                    The developer proved control of this app’s website domain.
                  </p>
                ) : trust?.claimed ? (
                  <p className="mt-3 text-sm text-neutral-600">
                    A developer has claimed this app; domain control has not
                    been verified.
                  </p>
                ) : null}
              </section>
            )}
            <section className="mt-8 border-t border-neutral-200 pt-6">
              <h2 className="text-xl font-semibold tracking-tight">About</h2>
              {app.description && (
                <>
                  <p className="mt-4 max-w-3xl whitespace-pre-wrap text-neutral-700">
                    {descriptionSummary(app.description)}
                  </p>
                  {descriptionSummary(app.description) !==
                    app.description.trim() && (
                    <details open className="mt-3 text-sm">
                      <summary className="cursor-pointer font-medium text-sky-700">
                        Read full description
                      </summary>
                      <p className="mt-3 whitespace-pre-wrap text-neutral-700">
                        {app.description}
                      </p>
                    </details>
                  )}
                </>
              )}
              <dl className="mt-5 grid gap-5 text-sm sm:grid-cols-2">
                {submission && (
                  <>
                    {submission.developer_handle && (
                      <div>
                        <dt className="text-neutral-500">
                          Submitted developer
                        </dt>
                        <dd className="mt-1 font-medium">
                          @{submission.developer_handle}{" "}
                          <span className="font-normal text-neutral-500">
                            (self-reported)
                          </span>
                        </dd>
                      </div>
                    )}
                    {submission.pricing_display && (
                      <div>
                        <dt className="text-neutral-500">
                          Pricing (self-reported)
                        </dt>
                        <dd className="mt-1 font-medium">
                          {submission.pricing_display}
                        </dd>
                      </div>
                    )}
                    {submission.stack?.length > 0 && (
                      <div>
                        <dt className="text-neutral-500">Build stack</dt>
                        <dd className="mt-1 font-medium">
                          {submission.stack.join(", ")}
                        </dd>
                      </div>
                    )}
                    {submission.languages?.length > 0 && (
                      <div>
                        <dt className="text-neutral-500">Languages</dt>
                        <dd className="mt-1 font-medium">
                          {submission.languages.join(", ")}
                        </dd>
                      </div>
                    )}
                    {submission.coupon_code && (
                      <div>
                        <dt className="text-neutral-500">
                          Developer offer (self-reported)
                        </dt>
                        <dd className="mt-1 font-medium">
                          {submission.coupon_code}
                          {submission.coupon_description
                            ? ` — ${submission.coupon_description}`
                            : ""}
                        </dd>
                      </div>
                    )}
                  </>
                )}
                <div>
                  <dt className="text-neutral-500">Category</dt>
                  <dd className="mt-1 font-medium">
                    {app.categories.join(", ") || "Not specified"}
                  </dd>
                </div>
                <div>
                  <dt className="text-neutral-500">Available on</dt>
                  <dd className="mt-1 font-medium">
                    {app.platforms.join(", ") || "Not specified"}
                  </dd>
                </div>
                {app.launched_at && (
                  <div>
                    <dt className="text-neutral-500">Launched</dt>
                    <dd className="mt-1 font-medium">
                      {date(app.launched_at)}
                    </dd>
                  </div>
                )}
              </dl>
              {app.tags.length > 0 && (
                <div className="mt-6 flex flex-wrap gap-2">
                  {app.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-neutral-100 px-3 py-1 text-xs text-neutral-600"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
              {presentation?.public_links?.length ? (
                <div className="mt-5 flex flex-wrap gap-3">
                  {presentation.public_links
                    .filter((url) => /^https:\/\//i.test(url))
                    .map((url) => (
                      <a
                        key={url}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                        className="text-sm font-medium text-sky-800 underline"
                      >
                        {linkHost(url)}
                      </a>
                    ))}
                </div>
              ) : null}
              {!trust?.claimed && app.claim_state === "unclaimed" && (
                <Link
                  to={`/apps/add?app=${app.id}`}
                  className="mt-6 inline-block text-sm font-semibold text-sky-700 hover:underline"
                >
                  Is this your app? Claim it
                </Link>
              )}
            </section>
            {sources.length > 0 && (
              <details open className="mt-10 border-t border-neutral-200 pt-6">
                <summary className="cursor-pointer text-xl font-semibold tracking-tight">
                  How we know
                </summary>
                <p className="mt-3 text-sm text-neutral-600">
                  Rocket lists this app from public sources. A listing is not an
                  endorsement.
                </p>
                <ul className="mt-4 space-y-3">
                  {sources.map((source) => (
                    <li
                      key={`${source.source_type}-${source.source_url}`}
                      className="flex items-center justify-between gap-3 border-t border-neutral-100 pt-3 text-sm"
                    >
                      <span className="capitalize">{source.source_type}</span>
                      <a
                        href={source.source_url}
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                        className="inline-flex items-center gap-1 text-sky-700 hover:underline"
                      >
                        View source <span aria-hidden="true">→</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {similar.length > 0 && (
              <section
                className="mt-10 border-t border-neutral-200 pt-6"
                aria-labelledby="similar-apps"
              >
                <h2
                  id="similar-apps"
                  className="text-xl font-semibold tracking-tight"
                >
                  Similar apps
                </h2>
                <p className="mt-2 mb-5 text-sm text-neutral-600">
                  Related by category, tags and platform—not a paid placement.
                </p>
                <div className="grid gap-x-8 sm:grid-cols-2">
                  {similar.map((item) => (
                    <MarketplaceListRow
                      key={item.id}
                      app={item}
                      {...similarSaveControls(item.id)}
                      metadata={similarMetadata.get(item.id)}
                    />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
