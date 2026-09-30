import { Link } from "@/lib/router-compat";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import logoAsset from "@/assets/showcase/logo.png.asset.json";
import guidelinesAsset from "@/assets/showcase/guidelines.png.asset.json";
import iconsAsset from "@/assets/showcase/icons.png";

const ShowcaseCard = ({
  i,
  title,
  description,
  bullets,
  ctaText,
  ctaLink,
  image,
  imageAlt,
  accent,
  imageScale = "scale-80 object-contain sm:scale-90 lg:scale-95",
}: {
  i: number;
  title: string;
  description: string;
  bullets: string[];
  ctaText: string;
  ctaLink: string;
  image: string;
  imageAlt: string;
  accent: "blue" | "coral" | "violet";
  imageScale?: string;
}) => {
  const accents = {
    blue: "bg-blue-50/70 ring-blue-100",
    coral: "bg-orange-50/70 ring-orange-100",
    violet: "bg-violet-50/70 ring-violet-100",
  };
  const dotAccents = {
    blue: "bg-blue-500",
    coral: "bg-orange-500",
    violet: "bg-violet-500",
  };

  const reversed = i % 2 !== 0;

  return (
    <article
      style={{ animationDelay: `${i * 100}ms` }}
      className="grid animate-fade-in grid-cols-1 gap-8 rounded-[2rem] bg-white p-6 ring-1 ring-neutral-200/70 sm:p-10 lg:grid-cols-2 lg:items-center lg:gap-12 lg:p-12"
    >
      <div
        className={`flex aspect-[4/3] items-center justify-center overflow-hidden lg:aspect-square ${reversed ? "lg:order-2" : "lg:order-1"}`}
      >
        <img
          src={image}
          alt={imageAlt}
          loading="lazy"
          className={`h-full w-full ${imageScale}`}
        />
      </div>

      <div className={reversed ? "lg:order-1" : "lg:order-2"}>
        <h3 className="text-3xl font-semibold tracking-tight text-neutral-900 sm:text-4xl lg:text-5xl">
          {title}
        </h3>
        <p className="mt-4 text-lg leading-relaxed text-neutral-600">
          {description}
        </p>
        <Button asChild className="mt-7">
          <Link to={ctaLink}>
            {ctaText} <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Button>
        <ul className="mt-7 space-y-3">
          {bullets.map((b) => (
            <li key={b} className="flex items-start gap-3 text-[15px] text-neutral-700">
              <span className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${dotAccents[accent]}`} />
              {b}
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
};

const CARDS = [
  {
    id: "logos",
    title: "Logo marks & wordmarks",
    description:
      "Generate distinctive logo directions from a URL or a few words. Get a mark, matching logotype, color palette, and typography in one pass — then refine the winner in the editor.",
    bullets: [
      "SVG, PNG & PDF exports",
      "Transparent & inverse variants",
      "One-click color reskinning",
      "Works for SaaS, AI, mobile & consumer brands",
    ],
    ctaText: "Generate logos",
    ctaLink: "/logos",
    image: logoAsset.url,
    imageAlt: "Generated logo directions",
    accent: "blue" as const,
  },
  {
    id: "icons",
    title: "App icons & glyphs",
    description:
      "Create crisp app icons, favicons, and custom glyph sets that match your logo system. Pick a style, generate a batch, and save the winners directly to your brand kit.",
    bullets: [
      "App store & favicon sizes",
      "Minimal, sticker, 3D & outline styles",
      "Scalable vector output",
      "Auto-matched to your brand palette",
    ],
    ctaText: "Generate icons",
    ctaLink: "/icons",
    image: iconsAsset,
    imageAlt: "Custom icon set",
    accent: "coral" as const,
    imageScale: "scale-65 object-contain sm:scale-75 lg:scale-80",
  },
  {
    id: "brand-kits",
    title: "Complete brand kits",
    description:
      "Turn any logo into a full brand kit: canonical colors, typography, templates, and organized files. One project, one source of truth for every launch asset.",
    bullets: [
      "Canonical logo, colors & type",
      "Social templates & launch assets",
      "Password-protected share links",
      "Export the whole kit as a ZIP",
    ],
    ctaText: "Create brand kit",
    ctaLink: "/brands",
    image: guidelinesAsset.url,
    imageAlt: "Brand kit spread",
    accent: "violet" as const,
  },
];

const CreateShowcase = () => {
  return (
    <section id="create" className="overflow-hidden border-t border-neutral-200/60 bg-white">
      <div className="mx-auto max-w-7xl px-6 py-28 sm:py-32">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="font-display text-3xl font-semibold leading-[1.05] tracking-tight text-neutral-900 sm:text-5xl md:text-6xl">
            What can you create<br /> with <span className="italic">Rocket?</span>
          </h2>
          <p className="mt-6 text-lg leading-relaxed text-neutral-600 sm:text-xl">
            Rocket is built around three core outputs: logos, icons, and brand kits. 
            Start with a logo direction, expand into matching icons, then wrap everything 
            into a shareable brand kit — all in one workspace.
          </p>
        </div>

        {/* Single column stack, logos leading */}
        <div className="mx-auto mt-16 flex max-w-5xl flex-col gap-8 sm:mt-20 sm:gap-10">
          {CARDS.map((c, i) => (
            <ShowcaseCard key={c.id} i={i} {...c} />
          ))}
        </div>

      </div>
    </section>
  );
};

export default CreateShowcase;
