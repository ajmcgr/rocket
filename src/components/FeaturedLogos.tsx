import { useRef } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import designduel from "@/assets/featured/designduel.png.asset.json";
import brandbear from "@/assets/featured/brandbear.png.asset.json";
import brandbearBear from "@/assets/featured/brandbear-bear.png.asset.json";
import bank from "@/assets/featured/bank.png.asset.json";
import ledger from "@/assets/featured/ledger.png.asset.json";

const PICKS = [
  { id: "designduel", title: "designduel", image_url: designduel.url, style: "Lockup" },
  { id: "brandbear", title: "Brandbear", image_url: brandbear.url, style: "Logotype" },
  { id: "brandbear-bear", title: "Brandbear mark", image_url: brandbearBear.url, style: "Icon" },
  { id: "bank", title: "Bank", image_url: bank.url, style: "Logotype" },
  { id: "ledger", title: "Ledger", image_url: ledger.url, style: "Logotype" },
];

export default function FeaturedLogos() {
  const picks = PICKS;

  const scrollerRef = useRef<HTMLDivElement>(null);
  const scrollBy = (dir: 1 | -1) => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.round(el.clientWidth * 0.8), behavior: "smooth" });
  };

  return (
    <section className="border-t border-neutral-200/60 bg-neutral-50/60">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-4xl font-medium tracking-tight sm:text-5xl">Actual brands made with Rocket</h2>
          <p className="mt-4 text-lg text-neutral-600">
            A shortlist of our favourite marks — every one of them started as a single prompt.
          </p>
        </div>

        <div className="relative mt-16">
          <button
            type="button"
            aria-label="Previous logos"
            onClick={() => scrollBy(-1)}
            className="absolute left-0 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 rounded-full border border-neutral-200 bg-white p-3 shadow-md transition hover:bg-neutral-50"
          >
            <ChevronLeft className="h-5 w-5 text-neutral-700" />
          </button>
          <button
            type="button"
            aria-label="Next logos"
            onClick={() => scrollBy(1)}
            className="absolute right-0 top-1/2 z-10 translate-x-1/2 -translate-y-1/2 rounded-full border border-neutral-200 bg-white p-3 shadow-md transition hover:bg-neutral-50"
          >
            <ChevronRight className="h-5 w-5 text-neutral-700" />
          </button>
          <div
            ref={scrollerRef}
            className="-mx-6 flex snap-x snap-mandatory gap-10 overflow-x-auto scroll-smooth px-6 pb-2 sm:gap-14 [&::-webkit-scrollbar]:hidden [scrollbar-width:none]"
          >
            {picks.map((tpl) => (
              <Link
                key={tpl.id}
                to="/templates"
                className="group flex shrink-0 snap-center flex-col items-center text-center"
              >
                <div className="flex h-48 w-48 items-center justify-center sm:h-56 sm:w-56 lg:h-64 lg:w-64">
                  <img
                    src={tpl.image_url}
                    alt={tpl.title}
                    className="h-full w-full object-contain transition duration-500 group-hover:scale-[1.04]"
                    loading="lazy"
                  />
                </div>
                <span className="mt-4 text-[11px] uppercase tracking-[0.16em] text-neutral-500">
                  {tpl.style}
                </span>
              </Link>
            ))}
          </div>
        </div>

        <div className="mt-10 flex justify-center">
          <Button asChild>
            <Link to="/templates">
              Browse templates <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}