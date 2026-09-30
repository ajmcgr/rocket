import { Minimize2 as ControlMinimize2, Maximize2 as ControlMaximize2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useParams, Link } from "@/lib/router-compat";
import { supabase as _sb } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import AssetVisual, { hasVisualRenderer } from "@/components/visuals/AssetVisual";
import BrandContextStrip from "@/components/BrandContextStrip";
import { Maximize2, Minimize2, Lock } from "@/components/EmojiIcons";
import { useDocumentMeta } from "@/hooks/useDocumentMeta";
const supabase = _sb as any;

const SharedAsset = () => {
  const { token } = useParams();
  const [asset, setAsset] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [isFs, setIsFs] = useState(false);
  const [meta, setMeta] = useState<any>(null);
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);

  useEffect(() => {
    const onChange = () => setIsFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const togglePresent = async () => {
    const el = stageRef.current;
    if (!el) return;
    if (!document.fullscreenElement) await el.requestFullscreen?.();
    else await document.exitFullscreen?.();
  };

  const fetchAsset = async (pw?: string) => {
    const { data } = await supabase.rpc("get_shared_asset", { _token: token, _password: pw ?? null });
    return data;
  };

  useEffect(() => {
    (async () => {
      if (!token) return;
      // First check meta to see if password is required (falls back gracefully if RPC missing).
      const { data: metaData } = await supabase.rpc("get_share_meta", { _token: token });
      setMeta(metaData || null);
      if (metaData?.requires_password) {
        setLoading(false);
        return;
      }
      const data = await fetchAsset();
      setAsset(data);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    setSubmitting(true);
    setPwError(null);
    const data = await fetchAsset(password);
    setSubmitting(false);
    if (!data) {
      setPwError("Incorrect password. Try again.");
      return;
    }
    setAsset(data);
  };

  if (loading)
    return (
      <div className="rocket-skeleton-surface mx-auto max-w-3xl space-y-4 rounded-2xl p-10">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="aspect-video w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    );

  if (!asset && meta?.requires_password) {
    return (
      <div className="min-h-screen bg-neutral-50">
        <header className="border-b border-neutral-200 bg-white px-6 py-4">
          <Link to="/" className="text-sm font-semibold tracking-tight">Rocket</Link>
        </header>
        <main className="mx-auto grid max-w-md place-items-center px-6 py-24">
          <form onSubmit={submitPassword} className="w-full space-y-5 rounded-2xl border border-neutral-200 bg-white p-8 shadow-xs">
            <div className="flex items-center gap-2">
              <div className="grid h-9 w-9 place-items-center rounded-full bg-neutral-900 text-white">
                <Lock className="h-4 w-4" />
              </div>
              <div>
                <div className="text-sm font-semibold text-neutral-900">Password required</div>
                <div className="text-xs text-neutral-500">{meta?.title || "This share link"} is protected.</div>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-neutral-600">Password</label>
              <input
                type="password"
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-hidden focus:border-neutral-400"
                placeholder="Enter password"
              />
              {pwError && <div className="text-xs text-red-600">{pwError}</div>}
            </div>
            <button
              type="submit"
              disabled={submitting || !password}
              className="w-full rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
            >
              {submitting ? "Unlocking…" : "Unlock"}
            </button>
          </form>
        </main>
      </div>
    );
  }

  if (!asset)
    return <div className="p-10 text-center text-sm text-neutral-500">This share link is invalid or has been disabled.</div>;

  const visual = hasVisualRenderer(asset);
  const isPresentation = asset.asset_type === "presentation";
  const ctx = asset?.meta?.brand_context || {};
  const metaDesc = ctx.oneLiner || ctx.tagline || ctx.positioning || (asset.content ? String(asset.content).slice(0, 160) : "Made with Rocket");
  useDocumentMeta({
    title: `${asset.title} · ${ctx.productName || "Rocket"}`,
    description: metaDesc,
    image: asset.image_url || ctx.logo || ctx.screenshot || null,
  });

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="border-b border-neutral-200 bg-white px-6 py-4">
        <Link to="/" className="text-sm font-semibold tracking-tight">Rocket</Link>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-12">
        <div className="text-xs normal-case tracking-wider text-neutral-500">{String(asset.asset_type || "").replace(/_/g, " ")}</div>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-neutral-900">{asset.title}</h1>

        {asset?.meta?.brand_context && (
          <div className="mt-6">
            <BrandContextStrip ctx={asset.meta.brand_context} compact />
          </div>
        )}

        {isPresentation && (
          <div className="mt-6">
            <button
              onClick={togglePresent}
              className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm hover:bg-neutral-50"
            >
              {isFs ? <ControlMinimize2 className="h-4 w-4" /> : <ControlMaximize2 className="h-4 w-4" />}
              {isFs ? "Exit present" : "Present fullscreen"}
            </button>
          </div>
        )}

        <div ref={stageRef} className={`mt-8 ${isFs ? "grid h-screen w-screen place-items-center bg-black p-6" : ""}`}>
          {visual ? (
            <AssetVisual asset={asset} />
          ) : asset.image_url ? (
            <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
              <div className="flex items-center justify-center bg-neutral-50 p-8">
                <img src={asset.image_url} alt={asset.title} className="max-h-[640px] w-auto" />
              </div>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
              <pre className="whitespace-pre-wrap p-8 font-sans text-sm leading-relaxed text-neutral-800">{asset.content || ""}</pre>
            </div>
          )}
        </div>

        <p className="mt-10 text-center text-xs text-neutral-400">
          Made with <Link to="/" className="underline">Rocket</Link>
        </p>
      </main>
    </div>
  );
};

export default SharedAsset;
