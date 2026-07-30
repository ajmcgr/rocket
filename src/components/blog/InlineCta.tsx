import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import type { Category } from "@/content/blogMeta";

const CTA_BY_CATEGORY: Record<string, { label: string; to: string; copy: string }> = {
  "Logo Design": { label: "Create your logo", to: "/logos", copy: "Describe your product and Rocket generates a logo, wordmark, and lockup in under a minute." },
  Icons: { label: "Design your icon", to: "/icons", copy: "Generate an app icon and every social profile size, cropped and centred automatically." },
  "Brand Kits": { label: "Generate your Brand Kit", to: "/brands", copy: "Logo files, social icons, palette, fonts, and a brand book — packaged and ready to download." },
  Typography: { label: "Explore your type", to: "/brands", copy: "Rocket sets your wordmark in real typefaces and keeps the whole kit in sync." },
  "Colour Theory": { label: "Build your palette", to: "/brands", copy: "Rocket samples your final artwork so your palette matches what you actually shipped." },
};

const DEFAULT_CTA = { label: "Try Rocket", to: "/signup", copy: "Turn one prompt into a logo, icons, palette, fonts, and a full brand kit." };

/** Contextual, non-intrusive product CTA matched to the article's topic. */
const InlineCta = ({ category }: { category: Category }) => {
  const cta = CTA_BY_CATEGORY[category] || DEFAULT_CTA;
  return (
    <aside className="not-prose my-10 rounded-2xl border border-neutral-200 bg-neutral-50 p-6">
      <p className="text-sm leading-relaxed text-neutral-700">{cta.copy}</p>
      <Link
        to={cta.to}
        className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-brand hover:underline"
      >
        {cta.label} <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </aside>
  );
};

export default InlineCta;