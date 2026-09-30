import { Link } from "@/lib/router-compat";
import { ExternalLink, Info } from "@/components/EmojiIcons";
import { categoryOf, CATEGORY_LABEL } from "@/lib/assetFamily";
import { assetHref, assetOpenLabel, isBrandAsset } from "@/lib/assetExperience";

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-[10px] normal-case tracking-wider text-neutral-400">{label}</div>
      <div className={`mt-0.5 truncate ${mono ? "font-mono text-[11px]" : ""} text-neutral-800`}>
        {value}
      </div>
    </div>
  );
}

export default function RightInspector({ asset }: { asset: any | null }) {
  return (
    <aside className="hidden w-[280px] shrink-0 border-l border-neutral-200 bg-white p-4 lg:block">
      <div className="text-[10px] font-semibold normal-case tracking-[0.18em] text-neutral-500">
        Properties
      </div>
      {!asset ? (
        <div className="mt-4 flex items-center gap-2 rounded-lg bg-neutral-50 p-3 text-xs text-neutral-500">
          <Info className="h-3.5 w-3.5" /> Select a deliverable to see its properties.
        </div>
      ) : (
        <div className="mt-3 space-y-4 text-xs">
          <Row label="Title" value={asset.title || "-"} />
          <Row label="Type" value={asset.asset_type || "-"} mono />
          <Row label="Category" value={CATEGORY_LABEL[categoryOf(asset)]} />
          {asset.source_url && <Row label="Source" value={asset.source_url} />}
          {asset.created_at && (
            <Row label="Created" value={new Date(asset.created_at).toLocaleString()} />
          )}
          {!isBrandAsset(asset) && (
            <div className="pt-2">
              <Link
                to={assetHref(asset)}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
              >
                <ExternalLink className="h-3.5 w-3.5" /> {assetOpenLabel(asset)}
              </Link>
            </div>
          )}
          <div className="pt-3">
            <div className="mb-1 text-[10px] font-semibold normal-case tracking-[0.18em] text-neutral-500">
              Layers
            </div>
            <p className="rounded-lg bg-neutral-50 p-2.5 text-[11px] text-neutral-500">
              Full layer controls live in the Editor. Open this deliverable to edit text, colors, and
              components.
            </p>
          </div>
        </div>
      )}
    </aside>
  );
}
