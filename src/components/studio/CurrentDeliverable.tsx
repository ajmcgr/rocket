import { GitBranch as ControlGitBranch, Copy as ControlCopy, History as ControlHistory } from "lucide-react";
import { Link } from "@/lib/router-compat";
import { Download, Copy, GitBranch, History, Wand2, ExternalLink } from "@/components/EmojiIcons";
import AssetVisual, { hasVisualRenderer } from "@/components/visuals/AssetVisual";
import { assetHref, assetOpenLabel, isBrandAsset } from "@/lib/assetExperience";

export default function CurrentDeliverable({
  asset,
  onDuplicate,
  onVariation,
  onHistory,
  onExport,
}: {
  asset: any | null;
  onDuplicate?: () => void;
  onVariation?: () => void;
  onHistory?: () => void;
  onExport?: () => void;
}) {
  if (!asset) {
    return (
      <section className="flex min-h-[420px] flex-col items-center justify-center rounded-2xl border border-dashed border-neutral-200 bg-white p-10 text-center">
        <Wand2 className="h-8 w-8 text-neutral-300" />
        <div className="mt-3 text-sm font-medium text-neutral-700">No deliverable selected</div>
        <p className="mt-1 max-w-sm text-xs text-neutral-500">
          Use the prompt on the left to create your first design, or pick one from the rail below.
        </p>
      </section>
    );
  }

  const title = asset.title || asset.asset_type || "Deliverable";

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold normal-case tracking-[0.18em] text-neutral-500">
            Current Deliverable
          </div>
          <h2 className="mt-0.5 truncate text-xl font-semibold text-neutral-900">{title}</h2>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {!isBrandAsset(asset) && (
            <Link
              to={assetHref(asset)}
              className="inline-flex items-center gap-1 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
            >
              <ExternalLink className="h-3.5 w-3.5" /> {assetOpenLabel(asset)}
            </Link>
          )}
          {onVariation && (
            <button
              onClick={onVariation}
              className="inline-flex items-center gap-1 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
            >
              <ControlGitBranch className="h-3.5 w-3.5" /> Create Variation
            </button>
          )}
          {onDuplicate && (
            <button
              onClick={onDuplicate}
              className="inline-flex items-center gap-1 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-xs text-neutral-600 hover:bg-neutral-50"
            >
              <ControlCopy className="h-3.5 w-3.5" /> Duplicate
            </button>
          )}
          {onHistory && (
            <button
              onClick={onHistory}
              className="inline-flex items-center gap-1 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-xs text-neutral-600 hover:bg-neutral-50"
            >
              <ControlHistory className="h-3.5 w-3.5" /> History
            </button>
          )}
          {onExport && (
            <button
              onClick={onExport}
              className="inline-flex items-center gap-1 rounded-full bg-brand px-3 py-1.5 text-xs font-medium text-brand-foreground hover:bg-brand-hover"
            >
              <Download className="h-3.5 w-3.5" /> Export
            </button>
          )}
        </div>
      </div>
      <div className="rounded-2xl border border-neutral-200 bg-white p-2 shadow-xs">
        {hasVisualRenderer(asset) ? (
          <div className="min-h-[420px]">
            <AssetVisual asset={asset} />
          </div>
        ) : asset.image_url ? (
          <img
            src={asset.image_url}
            alt={title}
            className="mx-auto max-h-[520px] w-auto rounded-xl object-contain"
          />
        ) : (
          <div className="p-10 text-center text-sm text-neutral-500">No preview available.</div>
        )}
      </div>
    </section>
  );
}
