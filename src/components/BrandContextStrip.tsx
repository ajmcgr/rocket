import { useMemo } from "react";
import { RefreshCw, Loader2 } from "lucide-react";

// Compact "who is this asset for?" strip used across Generate, AssetDetail, and Editor.
// Purely presentational — takes a brand_context object (from asset.meta.brand_context
// or the live sharedCtx on Generate) and renders logo + product + positioning + palette + tags.
// Additive: does not replace any existing UI; it is composed alongside.

export type BrandCtx = Record<string, any> | null | undefined;

export function isRichBrandCtx(ctx: BrandCtx): boolean {
  if (!ctx) return false;
  return Boolean(
    ctx.positioning ||
      ctx.targetCustomer ||
      ctx.category ||
      (ctx.audienceSegments && ctx.audienceSegments.length) ||
      (ctx.valueProps && ctx.valueProps.length) ||
      (ctx.voice && (ctx.voice.tone || (ctx.voice.traits && ctx.voice.traits.length))),
  );
}

export default function BrandContextStrip({
  ctx,
  compact = false,
  className = "",
  onRefresh,
  refreshing = false,
}: {
  ctx: BrandCtx;
  compact?: boolean;
  className?: string;
  onRefresh?: () => void | Promise<void>;
  refreshing?: boolean;
}) {
  const rich = useMemo(() => isRichBrandCtx(ctx), [ctx]);
  if (!ctx || (!ctx.productName && !ctx.url && !ctx.logo && !ctx.screenshot)) return null;

  const displayUrl = ctx.url ? String(ctx.url).replace(/^https?:\/\//, "").replace(/\/$/, "") : null;
  const summary = ctx.positioning || ctx.tagline || ctx.description;

  return (
    <div
      className={`rounded-xl border border-neutral-200 bg-gradient-to-br from-neutral-50 to-white ${
        compact ? "p-2.5" : "p-3"
      } ${className}`}
    >
      <div className="flex items-start gap-3">
        {(ctx.logo || ctx.favicon || ctx.screenshot) && (
          <img
            src={ctx.logo || ctx.favicon || ctx.screenshot}
            alt=""
            className={`shrink-0 rounded-md border border-neutral-200 bg-white object-contain p-1 ${
              compact ? "h-8 w-8" : "h-10 w-10"
            }`}
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold normal-case tracking-wider text-brand">Brand context</span>
            {rich && (
              <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[9px] font-medium normal-case tracking-wider text-emerald-700">
                Analyzed
              </span>
            )}
            {onRefresh && (ctx?.url || ctx?.source_url) && (
              <button
                onClick={() => onRefresh()}
                disabled={refreshing}
                title="Re-analyze the site"
                className="ml-auto inline-flex items-center gap-1 rounded-full border border-neutral-200 bg-white px-1.5 py-0.5 text-[9px] text-neutral-500 hover:bg-neutral-50 disabled:opacity-50"
              >
                {refreshing ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <RefreshCw className="h-2.5 w-2.5" />}
                {refreshing ? "Refreshing" : "Refresh"}
              </button>
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2">
            <span className="truncate text-sm font-semibold text-neutral-900">
              {ctx.productName || displayUrl || "Brand"}
            </span>
            {displayUrl && ctx.productName && <span className="truncate text-[11px] text-neutral-500">{displayUrl}</span>}
          </div>
          {summary && !compact && (
            <p className="mt-1 line-clamp-2 text-[11px] text-neutral-600">{summary}</p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {ctx.industry && (
              <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] text-neutral-700">{ctx.industry}</span>
            )}
            {ctx.category && ctx.category !== ctx.industry && (
              <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] text-neutral-700">{ctx.category}</span>
            )}
            {(ctx.audienceSegments || []).slice(0, compact ? 1 : 2).map((seg: string) => (
              <span key={seg} className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] text-neutral-700">
                {seg}
              </span>
            ))}
            {(ctx.colors || []).slice(0, 5).map((c: string, i: number) => (
              <span
                key={i}
                className="h-4 w-4 rounded border border-neutral-200"
                style={{ background: c }}
                title={c}
              />
            ))}
            {(ctx.fonts || []).slice(0, compact ? 1 : 2).map((f: string) => (
              <span
                key={f}
                className="rounded-full border border-neutral-200 px-2 py-0.5 text-[10px] text-neutral-600"
                style={{ fontFamily: `'${f}', system-ui` }}
              >
                {f}
              </span>
            ))}
          </div>
          {!compact && (ctx.competitors?.length || ctx.targetCustomer) && (
            <div className="mt-1.5 space-y-0.5 text-[10px] text-neutral-500">
              {ctx.targetCustomer && (
                <div>
                  <span className="text-neutral-400">Target:</span> {ctx.targetCustomer}
                </div>
              )}
              {ctx.competitors?.length ? (
                <div className="mt-1 rounded-md border border-amber-100 bg-amber-50/60 px-2 py-1.5">
                  <div className="mb-0.5 flex items-center gap-1 text-[9px] font-semibold normal-case tracking-wider text-amber-700">
                    Don't sound like
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {ctx.competitors.slice(0, 6).map((c: string) => (
                      <span
                        key={c}
                        className="rounded-full border border-amber-200 bg-white px-1.5 py-0.5 text-[9px] text-amber-800"
                        title="Avoid mirroring this competitor's voice"
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          )}
          {!compact && ctx.voice && (ctx.voice.tone || ctx.voice.traits?.length || ctx.voice.doNotSay?.length) && (
            <div className="mt-2 rounded-md border border-neutral-100 bg-white/60 p-2 text-[10px]">
              <div className="mb-1 font-semibold normal-case tracking-wider text-neutral-500">Voice</div>
              {ctx.voice.tone && <div className="text-neutral-700">{ctx.voice.tone}</div>}
              {ctx.voice.traits?.length ? (
                <div className="mt-1 flex flex-wrap gap-1">
                  {ctx.voice.traits.slice(0, 6).map((t: string) => (
                    <span key={t} className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[9px] text-emerald-700">{t}</span>
                  ))}
                </div>
              ) : null}
              {ctx.voice.doNotSay?.length ? (
                <div className="mt-1 flex flex-wrap gap-1">
                  {ctx.voice.doNotSay.slice(0, 5).map((t: string) => (
                    <span key={t} className="rounded-full bg-red-50 px-1.5 py-0.5 text-[9px] text-red-600 line-through decoration-red-400">{t}</span>
                  ))}
                </div>
              ) : null}
              {ctx.voice.sampleSentence && (
                <div className="mt-1.5 italic text-neutral-500">"{ctx.voice.sampleSentence}"</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}