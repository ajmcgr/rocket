import AssetThumbnail from "@/components/AssetThumbnail";

function Thumb({ asset }: { asset: any }) {
  if (asset?.editor_state || asset?.image_url || asset?.thumbnail_url) return <AssetThumbnail asset={asset} />;
  return (
    <div className="flex h-full w-full items-center justify-center bg-neutral-50 text-[10px] uppercase tracking-wider text-neutral-400">
      {asset.asset_type || "asset"}
    </div>
  );
}

export default function VariationStrip({
  variations,
  activeId,
  onSelect,
  onCreate,
}: {
  variations: any[];
  activeId?: string;
  onSelect: (a: any) => void;
  onCreate?: () => void;
}) {
  if (!variations.length) return null;
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
          Variations
        </div>
        <span className="text-[10px] text-neutral-400">{variations.length} in this direction</span>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {variations.map((a) => {
          const active = a.id === activeId;
          return (
            <button
              key={a.id}
              onClick={() => onSelect(a)}
              className={`group relative aspect-square h-24 w-24 shrink-0 overflow-hidden rounded-lg border transition ${
                active ? "border-brand ring-2 ring-brand/30" : "border-neutral-200 hover:border-neutral-400"
              }`}
              title={a.title || a.asset_type}
            >
              <Thumb asset={a} />
            </button>
          );
        })}
        {onCreate && (
          <button
            onClick={onCreate}
            className="flex aspect-square h-24 w-24 shrink-0 items-center justify-center rounded-lg border border-dashed border-neutral-300 text-xs text-neutral-500 hover:border-brand hover:text-brand"
          >
            + Variation
          </button>
        )}
      </div>
    </div>
  );
}