import { useEffect, useRef, useState } from "react";
import { toPng } from "html-to-image";
import type { Tables } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";
import { loadAppMedia, type PublicAppMedia } from "@/lib/appMedia";
import { screenshotImages, screenshotMetrics, type ScreenshotMetric } from "@/lib/adminAppScreenshot";
import "./AdminAppScreenshots.css";

type App = Tables<"public_apps">;
type Preview = { app: App; metrics: ScreenshotMetric[]; images: PublicAppMedia[] };

async function loadPreview(appId: string): Promise<Preview> {
  const [appResult, trafficResult, stripeResult, revenueResult, media] = await Promise.all([
    supabase.from("public_apps").select("*").eq("id", appId).maybeSingle(),
    supabase.from("public_app_traction").select("*").eq("app_id", appId),
    supabase.from("public_app_revenue").select("*").eq("app_id", appId),
    supabase.from("public_app_verified_revenue").select("*").eq("app_id", appId),
    loadAppMedia([appId], false, true),
  ]);
  const error = appResult.error || trafficResult.error || stripeResult.error || revenueResult.error;
  if (error) throw error;
  if (!appResult.data) throw new Error("This app is no longer public.");
  return {
    app: appResult.data,
    metrics: screenshotMetrics(trafficResult.data || [], stripeResult.data || [], revenueResult.data || []),
    images: screenshotImages(media.get(appId) || []),
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
    if (term.length < 2) { setResults([]); return; }
    let canceled = false;
    const timer = window.setTimeout(async () => {
      const { data, error: searchError } = await supabase
        .from("public_apps").select("*").ilike("name", `%${term}%`)
        .order("name").limit(12);
      if (!canceled) {
        setResults(data || []);
        if (searchError) setError(searchError.message);
      }
    }, 250);
    return () => { canceled = true; window.clearTimeout(timer); };
  }, [query]);

  const selectApp = async (appId: string) => {
    setLoading(true); setPreview(null); setError(""); setMessage("");
    try { setPreview(await loadPreview(appId)); }
    catch (cause) { setError((cause as Error).message); }
    finally { setLoading(false); }
  };

  const download = async () => {
    if (!preview || !cardRef.current) return;
    setExporting(true); setError(""); setMessage("");
    try {
      // Re-read public projections immediately before export. A revoked or
      // expired metric must never be captured from an old admin preview.
      const current = await loadPreview(preview.app.id);
      if (JSON.stringify(current.metrics) !== JSON.stringify(preview.metrics) ||
          JSON.stringify(current.images) !== JSON.stringify(preview.images) ||
          current.app.logo_url !== preview.app.logo_url) {
        setPreview(current);
        setMessage("Public app data changed. Review the updated preview, then download again.");
        return;
      }
      await document.fonts.ready;
      const image = await toPng(cardRef.current, {
        width: 1200,
        height: 900,
        pixelRatio: 1,
        backgroundColor: "#ffffff",
        cacheBust: true,
      });
      const link = document.createElement("a");
      link.href = image;
      link.download = `rocket-${preview.app.slug || preview.app.id}-profile-1200x900.png`;
      link.click();
      setMessage("PNG downloaded. You can post it wherever you choose.");
    } catch (cause) {
      setError(`Screenshot download failed: ${(cause as Error).message}`);
    } finally { setExporting(false); }
  };

  return <section className="rocket-admin-panel rocket-admin-screenshot-tool">
    <h2>App profile screenshot</h2>
    <p className="rocket-admin-muted">Create a Rocket-branded 1200 × 900 PNG with the app’s public product images and any currently public verified traffic or revenue cards. Private, expired, or disconnected metrics are excluded. Nothing is posted automatically.</p>
    <label className="rocket-admin-screenshot-search">Find a public app
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search app name" maxLength={80} autoComplete="off" />
    </label>
    {results.length > 0 && <div className="rocket-admin-screenshot-results" aria-label="Public app results">
      {results.map((app) => <button key={app.id} type="button" onClick={() => void selectApp(app.id)}>
        <strong>{app.name}</strong><span>{app.canonical_host}</span>
      </button>)}
    </div>}
    {loading && <p role="status">Loading public app data…</p>}
    {error && <p className="rocket-admin-error" role="alert">{error}</p>}
    {message && <p role="status" className="rocket-admin-muted">{message}</p>}
    {preview && <>
      <div className="rocket-admin-screenshot-actions">
        <p>{preview.metrics.length ? `${preview.metrics.length} public verified metric${preview.metrics.length === 1 ? "" : "s"}` : "No public verified metrics for this app"} · {preview.images.length} product image{preview.images.length === 1 ? "" : "s"}</p>
        <button className="rocket-admin-primary" disabled={exporting} onClick={() => void download()}>{exporting ? "Creating PNG…" : "Download PNG"}</button>
      </div>
      <div className="rocket-admin-screenshot-scroll"><div className="rocket-admin-screenshot-card" ref={cardRef}>
        <div className="rocket-admin-screenshot-top"><img src="/rocket-email-logo.png" alt="Rocket" /><span>THE OPEN APP PLATFORM</span></div>
        <div className="rocket-admin-screenshot-identity">
          <div className="rocket-admin-screenshot-app-logo">
            {preview.app.logo_url ? <img src={preview.app.logo_url} alt="" /> : <span>{preview.app.name.slice(0, 1).toUpperCase()}</span>}
          </div>
          <div className="rocket-admin-screenshot-title"><p>{preview.app.categories?.[0] || "App on Rocket"}</p><h3>{preview.app.name}</h3><div>{preview.app.tagline || preview.app.description?.trim().split(/\n/)[0] || ""}</div></div>
        </div>
        {preview.metrics.length > 0 && <div className="rocket-admin-screenshot-metrics">
          {preview.metrics.map((metric) => <div key={`${metric.label}-${metric.source}`} className="rocket-admin-screenshot-metric">
            <p>{metric.label}</p><strong>{metric.value}</strong><span>✓ Verified · {metric.source}</span>
          </div>)}
        </div>}
        {preview.images.length > 0 && <div className="rocket-admin-screenshot-images">
          {preview.images.map((item, index) => <div key={item.id} className="rocket-admin-screenshot-image"><img src={item.source_url} alt={`${preview.app.name} screenshot ${index + 1}`} /></div>)}
        </div>}
        <div className="rocket-admin-screenshot-bottom"><span>Discover {preview.app.name} on Rocket</span><strong>tryrocket.ai/apps/{preview.app.slug || preview.app.id}</strong></div>
      </div></div>
    </>}
  </section>;
}
