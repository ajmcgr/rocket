import { useMemo } from "react";

const CATEGORY_LABELS: Record<string, string> = {
  brand_guidelines: "Guidelines",
  brand_voice: "Brand voice",
  tone_of_voice: "Tone of voice",
  color_system: "Colors",
  font_system: "Fonts",
  typography_system: "Typography",
  positioning: "Positioning",
  value_proposition: "Value prop",
  messaging_framework: "Messaging",
  launch_copy: "Launch copy",
  product_hunt_copy: "Product Hunt",
  ph_copy: "Product Hunt",
  social_post: "Social copy",
  social_copy: "Social copy",
  founder_bio: "Founder bio",
  company_bio: "Company bio",
  press_bio: "Press bio",
  website_copy: "Website copy",
  email_copy: "Email copy",
  brand_strategy: "Strategy",
  audience_analysis: "Audience",
  copywriting_guide: "Copy guide",
};

function labelFor(t: string) {
  return CATEGORY_LABELS[t] || t.replace(/_/g, " ");
}

export default function BrandCategoryNav({
  assets,
  activeType,
  onSelect,
}: {
  assets: any[];
  activeType?: string | null;
  onSelect: (type: string | null) => void;
}) {
  const groups = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of assets) {
      const t = String(a.asset_type || "other");
      map.set(t, (map.get(t) || 0) + 1);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [assets]);

  if (groups.length === 0) return null;

  return (
    <nav className="rounded-2xl border border-neutral-200 bg-white p-2">
      <div className="px-2 py-1.5 text-[10px] font-semibold normal-case tracking-[0.18em] text-neutral-500">
        Brand
      </div>
      <button
        onClick={() => onSelect(null)}
        className={`flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm ${
          !activeType ? "bg-neutral-100 text-neutral-900" : "text-neutral-700 hover:bg-neutral-50"
        }`}
      >
        <span>All</span>
        <span className="text-[11px] text-neutral-400">{assets.length}</span>
      </button>
      {groups.map(([type, count]) => (
        <button
          key={type}
          onClick={() => onSelect(type)}
          className={`flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm capitalize ${
            activeType === type ? "bg-neutral-100 text-neutral-900" : "text-neutral-700 hover:bg-neutral-50"
          }`}
        >
          <span className="truncate">{labelFor(type)}</span>
          <span className="text-[11px] text-neutral-400">{count}</span>
        </button>
      ))}
    </nav>
  );
}