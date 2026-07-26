import AssetThumbnail from "@/components/AssetThumbnail";
import { categoryOf, CATEGORY_LABEL, type AssetCategory } from "@/lib/assetFamily";

function Thumb({ asset }: { asset: any }) {
  if (asset?.editor_state || asset?.image_url || asset?.thumbnail_url) return <AssetThumbnail asset={asset} />;
  return (
    <div className="flex h-full w-full items-center justify-center bg-neutral-50 text-[10px] uppercase tracking-wider text-neutral-400">
      {asset.asset_type}
    </div>
  );
}

const ORDER: AssetCategory[] = ["brand", "social", "launch", "marketing", "presentations", "press", "other"];

export default function RelatedAssetsRail({
  assets,
  activeId,
  onSelect,
}: {
  assets: any[];
  activeId?: string;
  onSelect: (a: any) => void;
}) {
  if (!assets.length) return null;
  const buckets = new Map<AssetCategory, any[]>();
  for (const a of assets) {
    const c = categoryOf(a);
    if (!buckets.has(c)) buckets.set(c, []);
    buckets.get(c)!.push(a);
  }
  return (
    <div className="space-y-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
        Brand System
      </div>
      {ORDER.filter((c) => buckets.has(c)).map((c) => (
        <div key={c}>
          <div className="mb-1.5 flex items-center gap-2">
            <div className="text-xs font-medium text-neutral-700">{CATEGORY_LABEL[c]}</div>
            <div className="h-px flex-1 bg-neutral-100" />
            <span className="text-[10px] text-neutral-400">{buckets.get(c)!.length}</span>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {buckets.get(c)!.map((a) => {
              const active = a.id === activeId;
              return (
                <button
                  key={a.id}
                  onClick={() => onSelect(a)}
                  className={`group aspect-square overflow-hidden rounded-lg border text-left transition ${
                    active ? "border-brand ring-2 ring-brand/30" : "border-neutral-200 hover:border-neutral-400"
                  }`}
                  title={a.title || a.asset_type}
                >
                  <Thumb asset={a} />
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}