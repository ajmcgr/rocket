import { useState } from "react";
import { Link } from "@/lib/router-compat";
import type { Tables } from "@/integrations/supabase/types";
import type { PublicAppMedia } from "@/lib/appMedia";
import { coverMedia, optimizedMediaUrl } from "@/lib/appMedia";
import AppLogo from "./AppLogo";
import SaveAppButton from "./SaveAppButton";
import TrendArrow from "./TrendArrow";
import AppPurchaseActions from "./AppPurchaseActions";
import type { AppCardMetadata } from "@/lib/appCardMetadata";
import { Bookmark } from "lucide-react";

type App = Tables<"public_apps">;
type BaseProps = {
  app: App;
  media?: PublicAppMedia[];
  eyebrow?: string;
  trend?: "up" | "down";
  metadata?: AppCardMetadata;
  rank?: number;
};
type SaveProps = {
  saved?: boolean;
  onSave?: (saved: boolean) => void;
  onCollectionsChanged?: () => void;
};

export function AppCardRating({
  metadata,
  light = false,
  larger = false,
}: {
  metadata?: AppCardMetadata;
  light?: boolean;
  larger?: boolean;
}) {
  if (!metadata) return null;
  if (!metadata.rating_count || metadata.average_rating == null)
    return (
      <span
        className={`block ${larger ? "text-sm" : "text-xs"} ${light ? "text-white/80" : "text-neutral-500"}`}
        aria-label="No ratings yet"
      >
        ☆ No ratings yet
      </span>
    );
  return (
    <span
      className={`block ${larger ? "text-sm" : "text-xs"} ${light ? "text-white" : "text-neutral-600"}`}
      aria-label={`${metadata.average_rating} out of 5 stars from ${metadata.rating_count} ratings`}
    >
      <span className="text-amber-500" aria-hidden="true">
        ★
      </span>{" "}
      {metadata.average_rating.toFixed(1)}{" "}
      <span className={light ? "text-white/80" : "text-neutral-500"}>
        ({metadata.rating_count.toLocaleString()})
      </span>
    </span>
  );
}

function AppCardIdentity({
  app,
  rank,
  metadata,
}: {
  app: App;
  rank?: number;
  metadata?: AppCardMetadata;
}) {
  return (
    <div className="flex min-w-0 items-start gap-3">
      <AppLogo name={app.name} src={app.logo_url} className="h-12 w-12" />
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-base font-semibold text-neutral-950">
          {app.name}
        </h3>
        <AppCardRating metadata={metadata} />
        <p className="truncate text-xs text-neutral-500">
          {app.categories[0] || app.canonical_host}
        </p>
      </div>
      {rank !== undefined && (
        <span className="shrink-0 text-sm font-semibold tabular-nums text-neutral-400">
          {String(rank).padStart(2, "0")}
        </span>
      )}
    </div>
  );
}

export function AppCardByline({
  metadata,
  light = false,
}: {
  metadata?: AppCardMetadata;
  light?: boolean;
}) {
  if (!metadata) return null;
  return (
    <div
      className={`flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs ${light ? "text-white/85" : "text-neutral-500"}`}
    >
      {metadata.developer_profile_username && (
        <Link
          to={`/@${metadata.developer_profile_username}`}
          className="truncate font-medium hover:underline"
          title="Ownership-backed public developer profile"
        >
          @{metadata.developer_profile_username}
        </Link>
      )}
      {metadata.pricing_kind && metadata.pricing_kind !== "unknown" && (
        <span title="Pricing supplied by the verified owner">
          {metadata.pricing_kind === "free"
            ? "Free · owner declared"
            : metadata.pricing_kind === "freemium"
              ? "Freemium"
              : "Paid"}
          {metadata.billing_model &&
          !["unknown", "both"].includes(metadata.billing_model)
            ? ` · ${metadata.billing_model.replaceAll("_", " ")}`
            : ""}
        </span>
      )}
      <span
        className="inline-flex items-center gap-1"
        title={`${metadata.save_count} saves`}
        aria-label={`${metadata.save_count} saves`}
      >
        <Bookmark className="h-3.5 w-3.5" aria-hidden="true" />
        {metadata.save_count.toLocaleString()}
      </span>
    </div>
  );
}

function Artwork({
  app,
  media,
  className,
  priority = false,
}: BaseProps & { className: string; priority?: boolean }) {
  const cover = coverMedia(media);
  const [failed, setFailed] = useState(false);
  return (
    <div className={`overflow-hidden ${className}`}>
      {cover && !failed ? (
        <img
          src={optimizedMediaUrl(cover.source_url, 720, 440, "contain")}
          srcSet={`${optimizedMediaUrl(cover.source_url, 480, 300, "contain")} 480w, ${optimizedMediaUrl(cover.source_url, 720, 440, "contain")} 720w, ${optimizedMediaUrl(cover.source_url, 1200, 750, "contain")} 1200w`}
          sizes={
            priority
              ? "(min-width: 1024px) 50vw, 100vw"
              : "(min-width: 1280px) 25vw, (min-width: 640px) 50vw, 100vw"
          }
          alt={`Product image for ${app.name}`}
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : "auto"}
          decoding="async"
          className="h-full w-full object-contain"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <AppLogo name={app.name} src={app.logo_url} className="h-20 w-20" />
        </div>
      )}
    </div>
  );
}

export function EditorialAppCard({
  app,
  media,
  eyebrow = "Explore",
  metadata,
  saved,
  onSave,
  priority = true,
}: BaseProps & SaveProps & { priority?: boolean }) {
  return (
    <article className="group relative min-h-[22rem] overflow-hidden rounded-[1.25rem] border border-neutral-200 bg-[#167ac6] text-white">
      <Artwork
        app={app}
        media={media}
        priority={priority}
        className="absolute inset-0 h-full w-full opacity-75 transition duration-500 group-hover:scale-[1.03]"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-[#167ac6] via-[#167ac6]/60 to-transparent" />
      <div className="relative flex min-h-[22rem] flex-col justify-end p-6 sm:p-8">
        <span className="text-xs font-semibold text-sky-200">{eyebrow}</span>
        <div className="mt-3 flex items-center gap-3">
          <AppLogo name={app.name} src={app.logo_url} className="h-14 w-14" />
          <div className="min-w-0">
            <h3 className="text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
              {app.name}
            </h3>
            <AppCardRating metadata={metadata} light />
            <p className="mt-1 line-clamp-2 text-sm text-neutral-100">
              {app.tagline || app.description || app.canonical_host}
            </p>
          </div>
        </div>
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-xs text-neutral-200">
          <span>{app.categories[0] || "App"}</span>
          <div className="flex items-center gap-2">
            {onSave && (
              <SaveAppButton
                appId={app.id}
                saved={Boolean(saved)}
                onChange={onSave}
                light
              />
            )}
            <AppPurchaseActions appId={app.id} appSlug={app.slug} light />
          </div>
        </div>
        <AppCardByline metadata={metadata} light />
      </div>
    </article>
  );
}

export function StandardAppCard({
  onCollectionsChanged,
  app,
  media,
  saved,
  onSave,
  eyebrow,
  trend,
  metadata,
  rank,
}: BaseProps & SaveProps) {
  const hasCover = Boolean(coverMedia(media));
  return (
    <article className="group flex h-full min-w-0 flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white transition hover:border-sky-300 hover:bg-neutral-50 hover:shadow-sm">
      <Link
        to={`/apps/${app.slug || app.id}`}
        className="min-w-0 focus-visible:outline-2 focus-visible:outline-sky-500"
      >
        {hasCover && (
          <Artwork app={app} media={media} className="h-40 w-full sm:h-44" />
        )}
        <div className="px-3 pb-3 pt-4 sm:px-4">
          <AppCardIdentity app={app} rank={rank} metadata={metadata} />
          <p className="mt-3 line-clamp-2 min-h-10 text-sm leading-relaxed text-neutral-600">
            {app.tagline || app.description || "Explore this app."}
          </p>
          {eyebrow && (
            <p className="mt-3 flex items-center gap-1 text-xs font-medium text-sky-800">
              {trend && <TrendArrow direction={trend} />}
              {eyebrow}
            </p>
          )}
        </div>
      </Link>
      <div className="px-3 pb-3 sm:px-4">
        <AppCardByline metadata={metadata} />
      </div>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 px-3 pb-3 text-xs text-neutral-500 sm:px-4">
        <span className="min-w-0 truncate">{app.canonical_host}</span>
        <div className="flex flex-wrap items-center gap-2">
          {onSave && (
            <SaveAppButton
              appId={app.id}
              saved={Boolean(saved)}
              onChange={onSave}
              onCollectionsChanged={onCollectionsChanged}
            />
          )}
          <AppPurchaseActions appId={app.id} appSlug={app.slug} />
        </div>
      </div>
    </article>
  );
}

export function RankedAppRow({
  app,
  rank,
  eyebrow,
  metadata,
  saved,
  onSave,
}: BaseProps & SaveProps & { rank: number }) {
  return (
    <article className="group flex min-h-20 min-w-0 flex-wrap items-center gap-3 border-b border-neutral-200/80 py-3 transition hover:bg-white/70">
      <span className="w-5 shrink-0 text-sm font-semibold tabular-nums text-neutral-400">
        {rank}
      </span>
      <AppLogo name={app.name} src={app.logo_url} className="h-11 w-11" />
      <div className="min-w-32 flex-1">
        <Link
          to={`/apps/${app.slug || app.id}`}
          className="block focus-visible:outline-2 focus-visible:outline-[#167ac6]"
        >
          <strong className="block truncate text-base font-semibold text-neutral-950">
            {app.name}
          </strong>
          <AppCardRating metadata={metadata} larger />
          <span className="block truncate text-sm text-neutral-500">
            {app.tagline || app.canonical_host}
          </span>
          <span className="mt-0.5 block truncate text-[13px] text-neutral-500">
            {app.categories[0] || "App"}
            {eyebrow ? ` · ${eyebrow}` : ""}
          </span>
        </Link>
        <AppCardByline metadata={metadata} />
      </div>
      {onSave && (
        <SaveAppButton
          appId={app.id}
          saved={Boolean(saved)}
          onChange={onSave}
          compact
        />
      )}
      <AppPurchaseActions appId={app.id} appSlug={app.slug} compact />
    </article>
  );
}

export function RisingAppCard({
  app,
  rank,
  metadata,
  saved,
  onSave,
}: BaseProps & SaveProps & { rank: number }) {
  return (
    <article className="group flex h-full min-w-0 flex-col rounded-2xl border border-neutral-200 bg-white p-4 transition hover:-translate-y-0.5 hover:border-sky-300 hover:shadow-sm">
      <Link
        to={`/apps/${app.slug || app.id}`}
        className="focus-visible:outline-2 focus-visible:outline-[#167ac6]"
      >
        <AppCardIdentity app={app} rank={rank} metadata={metadata} />
        <span className="mt-3 line-clamp-2 min-h-10 text-sm leading-5 text-neutral-600">
          {app.tagline || app.description || app.canonical_host}
        </span>
      </Link>
      <div className="mt-2">
        <AppCardByline metadata={metadata} />
      </div>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-5 text-xs text-neutral-500">
        <span className="min-w-0 truncate">{app.canonical_host}</span>
        <div className="flex items-center gap-2">
          {onSave && (
            <SaveAppButton
              appId={app.id}
              saved={Boolean(saved)}
              onChange={onSave}
            />
          )}
          <AppPurchaseActions appId={app.id} appSlug={app.slug} />
        </div>
      </div>
    </article>
  );
}

export function MarketplaceListRow({
  app,
  saved,
  onSave,
  metadata,
}: BaseProps & SaveProps) {
  return (
    <article className="flex min-w-0 items-center gap-3 border-b border-neutral-200/80 py-3">
      <div className="min-w-0 flex-1">
        <Link
          to={`/apps/${app.slug || app.id}`}
          className="flex min-w-0 flex-1 items-center gap-3 focus-visible:outline-2 focus-visible:outline-[#167ac6]"
        >
          <AppLogo name={app.name} src={app.logo_url} className="h-12 w-12" />
          <span className="min-w-0 flex-1">
            <strong className="block truncate text-base font-semibold text-neutral-950">
              {app.name}
            </strong>
            <AppCardRating metadata={metadata} larger />
            <span className="block truncate text-sm text-neutral-600">
              {app.tagline || app.description || app.canonical_host}
            </span>
            <span className="mt-0.5 block truncate text-[13px] text-neutral-500">
              {app.categories[0] || "App"}
            </span>
          </span>
        </Link>
        <div className="ml-15">
          <AppCardByline metadata={metadata} />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {onSave && (
          <SaveAppButton
            appId={app.id}
            saved={Boolean(saved)}
            onChange={onSave}
            compact
          />
        )}
        <AppPurchaseActions appId={app.id} appSlug={app.slug} compact />
      </div>
    </article>
  );
}
