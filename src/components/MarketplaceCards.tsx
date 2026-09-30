import { useState } from "react";
import { Link } from "@/lib/router-compat";
import type { Tables } from "@/integrations/supabase/types";
import type { PublicAppMedia } from "@/lib/appMedia";
import { coverMedia, optimizedMediaUrl } from "@/lib/appMedia";
import AppLogo from "./AppLogo";
import SaveAppButton from "./SaveAppButton";

type App = Tables<"public_apps">;
type BaseProps = { app: App; media?: PublicAppMedia[]; eyebrow?: string };
type SaveProps = { saved?: boolean; onSave?: (saved: boolean) => void };

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
          decoding="async"
          className="h-full w-full object-contain"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <AppLogo
            name={app.name}
            src={app.logo_url}
            className="h-20 w-20"
          />
        </div>
      )}
    </div>
  );
}

export function EditorialAppCard({
  app,
  media,
  eyebrow = "Explore",
}: BaseProps) {
  return (
    <Link
      to={`/apps/${app.id}`}
      className="group relative block min-h-[22rem] overflow-hidden rounded-[1.25rem] bg-[#167ac6] text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-500"
    >
      <Artwork
        app={app}
        media={media}
        priority
        className="absolute inset-0 h-full w-full opacity-75 transition duration-500 group-hover:scale-[1.03]"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-[#167ac6] via-[#167ac6]/60 to-transparent" />
      <div className="relative flex min-h-[22rem] flex-col justify-end p-6 sm:p-8">
        <span className="text-xs font-semibold text-sky-200">
          {eyebrow}
        </span>
        <div className="mt-3 flex items-center gap-3">
          <AppLogo
            name={app.name}
            src={app.logo_url}
            className="h-14 w-14"
          />
          <div className="min-w-0">
            <h3 className="text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
              {app.name}
            </h3>
            <p className="mt-1 line-clamp-2 text-sm text-neutral-100">
              {app.tagline || app.description || app.canonical_host}
            </p>
          </div>
        </div>
        <div className="mt-6 flex items-center justify-between text-xs text-neutral-200">
          <span>{app.categories[0] || "App"}</span>
          <span className="text-lg" aria-hidden="true">↗️</span>
        </div>
      </div>
    </Link>
  );
}

export function StandardAppCard({
  app,
  media,
  saved,
  onSave,
  eyebrow,
}: BaseProps & SaveProps) {
  const hasCover = Boolean(coverMedia(media));
  return (
    <article className="group flex min-w-0 flex-col overflow-hidden rounded-xl bg-white transition hover:bg-neutral-50">
      <Link
        to={`/apps/${app.id}`}
        className="min-w-0 focus-visible:outline-2 focus-visible:outline-sky-500"
      >
        {hasCover && <Artwork app={app} media={media} className="h-40 w-full sm:h-44" />}
        <div className="px-3 pb-3 pt-4 sm:px-4">
          <div className="flex items-start gap-3">
            <AppLogo name={app.name} src={app.logo_url} className="h-12 w-12" />
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-lg font-semibold text-neutral-950">
                {app.name}
              </h3>
              <p className="truncate text-xs text-neutral-500">
                {app.categories[0] || app.canonical_host}
              </p>
            </div>
          </div>
          <p className="mt-3 line-clamp-2 min-h-10 text-sm leading-relaxed text-neutral-600">
            {app.tagline || app.description || "Explore this app."}
          </p>
          {eyebrow && (
            <p className="mt-3 text-xs font-medium text-sky-800">{eyebrow}</p>
          )}
        </div>
      </Link>
      <div className="mt-auto flex items-center justify-between px-3 pb-3 text-xs text-neutral-500 sm:px-4">
        <span className="truncate">{app.canonical_host}</span>
        {onSave && (
          <SaveAppButton
            appId={app.id}
            saved={Boolean(saved)}
            onChange={onSave}
          />
        )}
      </div>
    </article>
  );
}

export function RankedAppRow({
  app,
  rank,
  eyebrow,
}: BaseProps & { rank: number }) {
  return (
    <Link
      to={`/apps/${app.id}`}
      className="group flex min-h-20 min-w-0 items-center gap-3 border-b border-neutral-200/80 py-3 transition hover:bg-white/70 focus-visible:outline-2 focus-visible:outline-[#167ac6]"
    >
      <span className="w-5 shrink-0 text-sm font-semibold tabular-nums text-neutral-400">
        {rank}
      </span>
      <AppLogo
        name={app.name}
        src={app.logo_url}
        className="h-11 w-11"
      />
      <span className="min-w-0 flex-1">
        <strong className="block truncate text-sm font-semibold text-neutral-950">
          {app.name}
        </strong>
        <span className="block truncate text-xs text-neutral-500">
          {app.tagline || app.canonical_host}
        </span>
        <span className="mt-0.5 block truncate text-[11px] text-neutral-500">
          {app.categories[0] || "App"}
          {eyebrow ? ` · ${eyebrow}` : ""}
        </span>
      </span>
      <span className="shrink-0 text-base" aria-hidden="true">↗️</span>
    </Link>
  );
}

export function RisingAppCard({
  app,
  rank,
}: BaseProps & { rank: number }) {
  return (
    <Link
      to={`/apps/${app.id}`}
      className="group flex h-full min-w-0 flex-col rounded-2xl border border-neutral-200 bg-white p-4 transition hover:-translate-y-0.5 hover:border-sky-300 hover:shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#167ac6]"
    >
      <div className="flex items-start justify-between gap-3">
        <AppLogo name={app.name} src={app.logo_url} className="h-12 w-12" />
        <span className="text-sm font-semibold tabular-nums text-neutral-400">{String(rank).padStart(2, "0")}</span>
      </div>
      <strong className="mt-5 line-clamp-1 text-base font-semibold text-neutral-950">{app.name}</strong>
      <span className="mt-1 line-clamp-2 min-h-10 text-sm leading-5 text-neutral-600">
        {app.tagline || app.description || app.canonical_host}
      </span>
      <span className="mt-auto flex items-center justify-between gap-2 pt-5 text-xs text-neutral-500">
        <span className="truncate">{app.categories[0] || "App"}</span>
        <span className="shrink-0 text-base" aria-hidden="true">↗️</span>
      </span>
    </Link>
  );
}

export function MarketplaceListRow({
  app,
  saved,
  onSave,
}: BaseProps & SaveProps) {
  return (
    <article className="flex min-w-0 items-center gap-3 border-b border-neutral-200/80 py-3">
      <Link
        to={`/apps/${app.id}`}
        className="flex min-w-0 flex-1 items-center gap-3 focus-visible:outline-2 focus-visible:outline-[#167ac6]"
      >
        <AppLogo name={app.name} src={app.logo_url} className="h-12 w-12" />
        <span className="min-w-0 flex-1">
          <strong className="block truncate text-sm font-semibold text-neutral-950">
            {app.name}
          </strong>
          <span className="block truncate text-xs text-neutral-600">
            {app.tagline || app.description || app.canonical_host}
          </span>
          <span className="mt-0.5 block truncate text-[11px] text-neutral-500">
            {app.categories[0] || "App"}
          </span>
        </span>
      </Link>
      {onSave && (
        <SaveAppButton
          appId={app.id}
          saved={Boolean(saved)}
          onChange={onSave}
        />
      )}
    </article>
  );
}
