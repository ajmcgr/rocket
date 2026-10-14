import { useEffect, useRef, useState } from "react";
import { Link } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import { track } from "@/lib/analytics";
import {
  loadFeaturedPlacements,
  rotateFooterPlacements,
  type FeaturedPlacement,
} from "@/lib/featuredAds";
import AppLogo from "./AppLogo";

function FeaturedCard({
  placement,
  slotId,
  surface,
  reserved,
}: {
  placement?: FeaturedPlacement;
  slotId: string;
  surface: "homepage" | "footer";
  reserved?: boolean;
}) {
  const element = useRef<HTMLElement>(null);
  useEffect(() => {
    if (
      !placement ||
      !element.current ||
      typeof IntersectionObserver === "undefined"
    )
      return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        const dimensions = {
          sponsorship_id: placement.sponsorship_id,
          app_id: placement.app.id,
          slot_id: slotId,
          placement_type: surface,
          occurred_at: new Date().toISOString(),
        };
        track("sponsored_impression", dimensions);
        void supabase.functions.invoke("rocket-advertising", {
          body: {
            action: "metric",
            sponsorship_id: placement.sponsorship_id,
            app_id: placement.app.id,
            event_type: "view",
            placement_type: surface,
          },
        });
        observer.disconnect();
      },
      { threshold: 0.5 },
    );
    observer.observe(element.current);
    return () => observer.disconnect();
  }, [placement, slotId, surface]);

  if (!placement && reserved)
    return (
      <article className="flex min-h-36 items-center rounded-2xl border border-neutral-200 bg-neutral-50 p-5 text-sm font-semibold text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300">
        Sponsored placement reserved
      </article>
    );

  if (!placement)
    return (
      <article className="flex min-h-36 flex-col justify-between rounded-2xl border border-dashed border-neutral-300 bg-neutral-50/60 p-5 text-neutral-800 dark:border-neutral-700 dark:bg-neutral-900/40 dark:text-neutral-100">
        <div>
          <p className="text-xs font-bold tracking-widest text-neutral-500 dark:text-neutral-400">
            YOUR AD HERE
          </p>
          <p className="mt-2 text-sm">
            Put your app in front of people discovering new software.
          </p>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-semibold">$49 / 7 days</span>
          <Link
            to="/advertise"
            onClick={() =>
              track("empty_sponsorship_cta_clicked", {
                slot_id: slotId,
                placement_type: surface,
              })
            }
            className="inline-flex min-h-11 items-center rounded-lg border border-sky-600 px-3 text-sm font-semibold text-sky-700 hover:bg-sky-50 dark:text-sky-300 dark:hover:bg-sky-950"
          >
            Feature your app
          </Link>
        </div>
      </article>
    );

  const href = `/apps/${placement.app.slug || placement.app.id}?sponsor=${placement.sponsorship_id}`;
  const website = placement.destination_url?.startsWith("https://")
    ? placement.destination_url
    : null;
  const recordClick = () => {
    track("sponsored_click", {
      sponsorship_id: placement.sponsorship_id,
      app_id: placement.app.id,
      slot_id: slotId,
      placement_type: surface,
      occurred_at: new Date().toISOString(),
    });
    void supabase.functions.invoke("rocket-advertising", {
      body: {
        action: "metric",
        sponsorship_id: placement.sponsorship_id,
        app_id: placement.app.id,
        event_type: "click",
        placement_type: surface,
      },
    });
  };
  const action =
    "inline-flex min-h-11 shrink-0 items-center rounded-xl border border-sky-600 px-4 text-sm font-semibold text-sky-700 hover:bg-sky-50 dark:text-sky-300 dark:hover:bg-sky-950";
  return (
    <article
      ref={element}
      className="flex min-h-36 flex-col justify-between rounded-2xl border border-sky-200 bg-white p-5 dark:border-sky-900 dark:bg-neutral-950"
    >
      <span className="rocket-sponsored-label self-start rounded-full bg-sky-50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-sky-800">
        Sponsored
      </span>
      <div className="mt-3 flex min-w-0 flex-wrap items-center gap-3">
        <Link
          to={href}
          onClick={recordClick}
          aria-label={`View ${placement.app.name}`}
          className="shrink-0 rounded-xl focus-visible:outline-2 focus-visible:outline-sky-500"
        >
          <AppLogo
            name={placement.app.name}
            src={placement.app.logo_url}
            className="h-12 w-12"
          />
        </Link>
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-bold">{placement.app.name}</h3>
          {placement.app.tagline && (
            <p className="line-clamp-2 text-sm text-neutral-600 dark:text-neutral-400">
              {placement.app.tagline}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {website && (
            <a
              href={website}
              target="_blank"
              rel="sponsored noopener noreferrer"
              onClick={recordClick}
              className={action}
            >
              Visit website
            </a>
          )}
          <Link to={href} onClick={recordClick} className={action}>
            View app
          </Link>
        </div>
      </div>
    </article>
  );
}

export default function FeaturedAdRows({
  slots,
  surface,
  path = "",
}: {
  slots?: number[];
  surface: "homepage" | "footer";
  path?: string;
}) {
  const [placements, setPlacements] = useState<FeaturedPlacement[]>([]);
  const [occupiedSlotIds, setOccupiedSlotIds] = useState<string[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [day] = useState(() => new Date().toISOString().slice(0, 10));
  useEffect(() => {
    let active = true;
    void loadFeaturedPlacements()
      .then((result) => {
        if (active) {
          setPlacements(result.placements);
          setOccupiedSlotIds(result.occupiedSlotIds);
          setStatus("ready");
        }
      })
      .catch(() => {
        if (active) setStatus("error");
      });
    return () => {
      active = false;
    };
  }, []);
  const selected =
    surface === "footer" ? rotateFooterPlacements(placements, path, day) : [];
  const positions =
    surface === "homepage"
      ? (slots || []).map((n) => ({
          slotId: `homepage_featured_${n}`,
          placement: placements.find(
            (item) => item.homepage_slot_id === `homepage_featured_${n}`,
          ),
          reserved: occupiedSlotIds.includes(`homepage_featured_${n}`),
        }))
      : [0, 1].map((n) => ({
          slotId: selected[n]?.homepage_slot_id || `footer_empty_${n + 1}`,
          placement: selected[n],
          reserved: false,
        }));
  return (
    <section
      aria-label={
        surface === "homepage"
          ? `Sponsored apps, row ${Math.ceil((slots?.[0] || 1) / 2)}`
          : "Sponsored apps"
      }
      className={
        surface === "homepage"
          ? "mt-10 sm:mt-12"
          : "border-t border-neutral-200 bg-white px-5 py-12 dark:border-neutral-800 dark:bg-neutral-950 sm:px-8"
      }
    >
      <div className={surface === "footer" ? "mx-auto max-w-6xl" : ""}>
        {surface === "footer" && (
          <h2 className="mb-5 text-lg font-bold">Sponsored apps</h2>
        )}
        <div className="grid gap-4 md:grid-cols-2">
          {positions.map(({ slotId, placement, reserved }) =>
            status === "ready" ? (
              <FeaturedCard
                key={`${surface}-${slotId}`}
                placement={placement}
                slotId={slotId}
                surface={surface}
                reserved={reserved}
              />
            ) : (
              <div
                key={`${surface}-${slotId}`}
                className="min-h-36 rounded-2xl border border-neutral-200 bg-neutral-50 p-5 text-sm text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900"
                aria-busy={status === "loading"}
              >
                {status === "error"
                  ? "Sponsored placements are temporarily unavailable."
                  : "Loading sponsored apps…"}
              </div>
            ),
          )}
        </div>
      </div>
    </section>
  );
}
