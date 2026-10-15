import { useEffect, useRef, useState } from "react";
import { toPng } from "html-to-image";
import {
  BarChart3,
  Bookmark,
  DollarSign,
  Eye,
  Share2,
  ShieldCheck,
  Users,
} from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";
import { loadAppMedia, type PublicAppMedia } from "@/lib/appMedia";
import {
  screenshotImages,
  screenshotMetrics,
  type ScreenshotMetric,
} from "@/lib/adminAppScreenshot";
import { SUBMISSION_PLATFORMS } from "../../supabase/functions/_shared/appSubmission";
import "./AdminAppScreenshots.css";

type App = Tables<"public_apps">;
type ReviewSummary = Tables<"public_app_review_summary">;
type Preview = {
  app: App;
  metrics: ScreenshotMetric[];
  images: PublicAppMedia[];
  review: ReviewSummary | null;
};

const descriptionSummary = (description: string) => {
  const firstParagraph = description.trim().split(/\n\s*\n/)[0];
  return firstParagraph.length > 360
    ? `${firstParagraph.slice(0, 360).replace(/\s+\S*$/, "")}…`
    : firstParagraph;
};

const metricIcon = (label: string) =>
  label === "Daily active users"
    ? Users
    : label === "Daily views"
      ? Eye
      : label === "Daily sessions"
        ? BarChart3
        : DollarSign;

async function loadPreview(appId: string): Promise<Preview> {
  const [
    appResult,
    trafficResult,
    stripeResult,
    revenueResult,
    reviewResult,
    media,
  ] = await Promise.all([
    supabase.from("public_apps").select("*").eq("id", appId).maybeSingle(),
    supabase.from("public_app_traction").select("*").eq("app_id", appId),
    supabase.from("public_app_revenue").select("*").eq("app_id", appId),
    supabase
      .from("public_app_verified_revenue")
      .select("*")
      .eq("app_id", appId),
    supabase
      .from("public_app_review_summary")
      .select("app_id,rating_count,average_rating")
      .eq("app_id", appId)
      .maybeSingle(),
    loadAppMedia([appId], false, true),
  ]);
  const error =
    appResult.error ||
    trafficResult.error ||
    stripeResult.error ||
    revenueResult.error;
  if (error) throw error;
  if (!appResult.data) throw new Error("This app is no longer public.");
  return {
    app: appResult.data,
    metrics: screenshotMetrics(
      trafficResult.data || [],
      stripeResult.data || [],
      revenueResult.data || [],
    ),
    images: screenshotImages(media.get(appId) || []),
    review: reviewResult.error ? null : reviewResult.data,
  };
}

export default function AdminAppScreenshots() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<App[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const term = query.trim().slice(0, 80);
    if (term.length < 2) {
      setResults([]);
      return;
    }
    let canceled = false;
    const timer = window.setTimeout(async () => {
      const { data, error: searchError } = await supabase
        .from("public_apps")
        .select("*")
        .ilike("name", `%${term}%`)
        .order("name")
        .limit(12);
      if (!canceled) {
        setResults(data || []);
        if (searchError) setError(searchError.message);
      }
    }, 250);
    return () => {
      canceled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  const selectApp = async (appId: string) => {
    setQuery("");
    setResults([]);
    setLoading(true);
    setPreview(null);
    setError("");
    setMessage("");
    try {
      setPreview(await loadPreview(appId));
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const download = async () => {
    if (!preview || !cardRef.current) return;
    setExporting(true);
    setError("");
    setMessage("");
    try {
      // Re-read public projections immediately before export. A revoked or
      // expired metric must never be captured from an old admin preview.
      const current = await loadPreview(preview.app.id);
      if (
        JSON.stringify(current.metrics) !== JSON.stringify(preview.metrics) ||
        JSON.stringify(current.images) !== JSON.stringify(preview.images) ||
        JSON.stringify(current.app) !== JSON.stringify(preview.app) ||
        JSON.stringify(current.review) !== JSON.stringify(preview.review)
      ) {
        setPreview(current);
        setMessage(
          "Public app data changed. Review the updated preview, then download again.",
        );
        return;
      }
      await document.fonts.ready;
      await Promise.all(
        Array.from(cardRef.current.querySelectorAll("img"), (img) =>
          img.decode().catch(() => undefined),
        ),
      );
      const image = await toPng(cardRef.current, {
        width: 1600,
        height: 900,
        pixelRatio: 1,
        backgroundColor: "#f6f8fb",
        cacheBust: true,
      });
      const link = document.createElement("a");
      link.href = image;
      link.download = `rocket-${preview.app.slug || preview.app.id}-profile-1600x900.png`;
      link.click();
      setMessage("PNG downloaded. You can post it wherever you choose.");
    } catch (cause) {
      setError(`Screenshot download failed: ${(cause as Error).message}`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <section className="rocket-admin-panel rocket-admin-screenshot-tool">
      <h2>App page screenshot</h2>
      <p className="rocket-admin-muted">
        Download a 1600 × 900 image styled like the public app page for X or
        LinkedIn. It uses the app’s public details, product images, and any
        currently public verified traffic or revenue cards. Private, expired, or
        disconnected metrics are excluded. Nothing is posted automatically.
      </p>
      <label className="rocket-admin-screenshot-search">
        Find a public app
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search app name"
          maxLength={80}
          autoComplete="off"
        />
      </label>
      {results.length > 0 && (
        <div
          className="rocket-admin-screenshot-results"
          aria-label="Public app results"
        >
          {results.map((app) => (
            <button
              key={app.id}
              type="button"
              onClick={() => void selectApp(app.id)}
            >
              <strong>{app.name}</strong>
              <span>{app.canonical_host}</span>
            </button>
          ))}
        </div>
      )}
      {loading && <p role="status">Loading public app data…</p>}
      {error && (
        <p className="rocket-admin-error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="rocket-admin-muted">
          {message}
        </p>
      )}
      {preview && (
        <>
          <div className="rocket-admin-screenshot-actions">
            <p>
              {preview.metrics.length
                ? `${preview.metrics.length} public verified metric${preview.metrics.length === 1 ? "" : "s"}`
                : "No public verified metrics for this app"}{" "}
              · {preview.images.length} product image
              {preview.images.length === 1 ? "" : "s"}
            </p>
            <button
              className="rocket-admin-primary"
              disabled={exporting}
              onClick={() => void download()}
            >
              {exporting ? "Creating PNG…" : "Download PNG"}
            </button>
          </div>
          <div className="rocket-admin-screenshot-scroll">
            <div className="rocket-admin-screenshot-page" ref={cardRef}>
              <div className="rocket-admin-screenshot-site-header">
                <img src="/rocket-email-logo.png" alt="Rocket" />
                <span>
                  tryrocket.ai/apps/{preview.app.slug || preview.app.id}
                </span>
              </div>
              <div className="rocket-admin-screenshot-main">
                <div className="rocket-admin-screenshot-back">
                  ← &nbsp;Back to Discover
                </div>
                <div className="rocket-admin-screenshot-profile">
                  <div className="rocket-admin-screenshot-identity">
                    <div className="rocket-admin-screenshot-app-logo">
                      {preview.app.logo_url ? (
                        <img src={preview.app.logo_url} alt="" />
                      ) : (
                        <span>
                          {preview.app.name.slice(0, 1).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div className="rocket-admin-screenshot-title">
                      <h3>{preview.app.name}</h3>
                      <p>
                        {preview.app.tagline ||
                          (preview.app.description
                            ? descriptionSummary(preview.app.description)
                            : preview.app.canonical_host)}
                      </p>
                      <div className="rocket-admin-screenshot-labels">
                        <strong>{preview.app.categories?.[0] || "App"}</strong>
                        {(preview.app.platforms || []).map((platform) => (
                          <span key={platform}>
                            {SUBMISSION_PLATFORMS.find(
                              ({ id }) => id === platform,
                            )?.label || platform}
                          </span>
                        ))}
                      </div>
                      {preview.review && (
                        <div className="rocket-admin-screenshot-rating">
                          <span>★</span> {preview.review.average_rating} ·{" "}
                          {preview.review.rating_count}{" "}
                          {preview.review.rating_count === 1
                            ? "review"
                            : "reviews"}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="rocket-admin-screenshot-actions-preview">
                    <span className="rocket-admin-screenshot-visit">
                      Visit website <span aria-hidden="true">→</span>
                    </span>
                    <span className="rocket-admin-screenshot-icon-action">
                      <Bookmark size={21} />
                    </span>
                    <span className="rocket-admin-screenshot-share">
                      <Share2 size={18} /> Share
                    </span>
                    <span className="rocket-admin-screenshot-host">
                      {preview.app.canonical_host}
                    </span>
                  </div>
                  {preview.metrics.length > 0 && (
                    <div className="rocket-admin-screenshot-metrics">
                      {preview.metrics.map((metric) => {
                        const Icon = metricIcon(metric.label);
                        return (
                          <div
                            key={`${metric.label}-${metric.source}`}
                            className="rocket-admin-screenshot-metric"
                          >
                            <p>
                              <Icon size={20} aria-hidden="true" />{" "}
                              {metric.label}
                            </p>
                            <strong>{metric.value}</strong>
                            <span>
                              <ShieldCheck size={16} aria-hidden="true" />{" "}
                              Verified
                            </span>
                            <small>{metric.source}</small>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {preview.images.length > 0 && (
                    <section className="rocket-admin-screenshot-gallery">
                      <h4>See {preview.app.name} in action</h4>
                      <div className="rocket-admin-screenshot-images">
                        {preview.images.map((item, index) => (
                          <div
                            key={item.id}
                            className="rocket-admin-screenshot-image"
                          >
                            <img
                              src={item.source_url}
                              alt={`${preview.app.name} screenshot ${index + 1}`}
                            />
                          </div>
                        ))}
                      </div>
                    </section>
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
