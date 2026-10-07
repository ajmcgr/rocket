import { useEffect, useState } from "react";
import { Link, useParams } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { loadAppMedia } from "@/lib/appMedia";
import { availableCategories } from "@/lib/appCategories";

type App = Tables<"public_apps">;

export default function EditAppProfile() {
  const { id } = useParams();
  const [app, setApp] = useState<App | null>(null);
  const [allowed, setAllowed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [logo, setLogo] = useState("");
  const [pricing, setPricing] = useState("");
  const [developerHandle, setDeveloperHandle] = useState("");
  const [links, setLinks] = useState("");
  const [media, setMedia] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }
    let canceled = false;
    Promise.all([
      supabase.from("public_apps").select("*").eq("id", id).maybeSingle(),
      supabase
        .from("app_owners")
        .select("verification_level")
        .eq("app_id", id)
        .is("revoked_at", null)
        .maybeSingle(),
      supabase
        .from("public_app_presentation")
        .select("pricing_display,public_links,developer_handle")
        .eq("app_id", id)
        .maybeSingle(),
      loadAppMedia([id], false),
    ])
      .then(([appResult, ownerResult, presentation, mediaResult]) => {
        if (canceled) return;
        const item = appResult.data;
        setApp(item);
        setAllowed(ownerResult.data?.verification_level === "domain_verified");
        if (item) {
          setName(item.name);
          setDescription(item.description || "");
          setCategory(item.categories[0] || "");
          setLogo(item.logo_url || "");
        }
        setPricing(presentation.data?.pricing_display || "");
        setDeveloperHandle(presentation.data?.developer_handle || "");
        setLinks((presentation.data?.public_links || []).join("\n"));
        setMedia(
          (mediaResult.get(id) || [])
            .filter((row) => row.source_type === "owner")
            .map((row) => row.source_url)
            .join("\n"),
        );
        setLoading(false);
      })
      .catch(() => {
        if (!canceled) {
          setError("Could not load this app.");
          setLoading(false);
        }
      });
    return () => {
      canceled = true;
    };
  }, [id]);
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!id) return;
    setBusy(true);
    setError("");
    setNotice("");
    const mediaUrls = media
      .split("\n")
      .map((value) => value.trim())
      .filter(Boolean);
    const { data, error: requestError } = await supabase.functions.invoke(
      "rocket-apps",
      {
        body: {
          action: "update_presentation",
          app_id: id,
          name,
          description,
          category,
          logo_url: logo,
          pricing_display: pricing,
          developer_handle: developerHandle.replace(/^@/, ""),
          public_links: links
            .split("\n")
            .map((value) => value.trim())
            .filter(Boolean),
          media: mediaUrls.map((url) => ({ type: "screenshot", url })),
        },
      },
    );
    if (requestError || data?.error) {
      let detail = data?.error || requestError?.message;
      try {
        detail =
          (await (requestError as { context?: Response })?.context?.json())
            ?.error || detail;
      } catch {
        /* no JSON */
      }
      setError(detail || "Could not save this profile.");
    } else
      setNotice(
        "Public presentation saved. Source evidence and verification records were not changed.",
      );
    setBusy(false);
  };
  return (
    <main className="mx-auto max-w-3xl px-5 pb-24 pt-10 sm:px-8">
      <Link to="/your-apps" className="text-sm text-sky-800 hover:underline">
        ← My Apps
      </Link>
      <h1 className="mt-4 font-display text-4xl">Edit app profile</h1>
      <p className="mt-2 text-sm text-neutral-600">
        Improve how your app appears on Rocket. Original Launch data and trust
        evidence remain separate.
      </p>
      {loading && (
        <div role="status" aria-label="Loading app profile" className="rocket-skeleton-surface mt-8 animate-pulse rounded-2xl p-6">
          <div className="h-6 w-1/2 rounded bg-neutral-100" />
          <div className="mt-4 h-4 w-3/4 rounded bg-neutral-100" />
        </div>
      )}
      {error && (
        <p
          role="alert"
          className="mt-6 rounded-xl bg-red-50 p-4 text-sm text-red-800"
        >
          {error}
        </p>
      )}
      {notice && (
        <p
          role="status"
          className="mt-6 rounded-xl bg-green-50 p-4 text-sm text-green-800"
        >
          {notice}
        </p>
      )}
      {!loading && !allowed && (
        <div className="mt-8 rounded-xl border border-neutral-200 bg-white p-6 text-sm text-neutral-700">
          Domain-verified ownership is required to edit this listing.{" "}
          <Link
            to={`/apps/add?app=${id}`}
            className="font-semibold text-sky-800 underline"
          >
            Manage verification
          </Link>
        </div>
      )}
      {!loading && allowed && app && (
        <form
          onSubmit={save}
          className="mt-8 space-y-5 rounded-[1.75rem] border border-neutral-200 bg-white p-6 sm:p-8"
        >
          <label className="block text-sm font-medium">
            Display name
            <input
              required
              minLength={2}
              maxLength={120}
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mt-1 w-full rounded-lg border p-3"
            />
          </label>
          <label className="block text-sm font-medium">
            Description
            <textarea
              required
              minLength={20}
              maxLength={2000}
              rows={5}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className="mt-1 w-full rounded-lg border p-3"
            />
          </label>
          <label className="block text-sm font-medium">
            Primary category
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="mt-1 w-full rounded-lg border bg-white p-3"
            >
              <option value="">Choose a category</option>
              {availableCategories(category ? [category] : []).map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
          <label className="block text-sm font-medium">
            Logo URL
            <input
              type="url"
              value={logo}
              onChange={(event) => setLogo(event.target.value)}
              className="mt-1 w-full rounded-lg border p-3"
            />
            <span className="mt-1 block text-xs text-neutral-500">
              Use a PNG, JPEG or WebP from your verified website or Rocket
              Storage.
            </span>
          </label>
          <label className="block text-sm font-medium">
            Product images (one URL per line)
            <textarea
              rows={4}
              value={media}
              onChange={(event) => setMedia(event.target.value)}
              className="mt-1 w-full rounded-lg border p-3"
            />
            <span className="mt-1 block text-xs text-neutral-500">
              Up to eight real screenshots, from your website or Rocket Storage.
              Launch images remain separately attributed.
            </span>
          </label>
          <label className="block text-sm font-medium">
            Public developer handle (optional)
            <input
              value={developerHandle}
              onChange={(event) => setDeveloperHandle(event.target.value)}
              maxLength={31}
              pattern="@?[A-Za-z0-9_]{2,30}"
              placeholder="@yourhandle"
              className="mt-1 w-full rounded-lg border p-3"
            />
            <span className="mt-1 block text-xs text-neutral-500">
              Shown on your app cards as an owner-provided handle. Leave blank to hide it.
            </span>
          </label>
          <label className="block text-sm font-medium">
            Pricing description (optional)
            <input
              maxLength={60}
              value={pricing}
              onChange={(event) => setPricing(event.target.value)}
              placeholder="e.g. Free plan available"
              className="mt-1 w-full rounded-lg border p-3"
            />
            <span className="mt-1 block text-xs text-neutral-500">
              Owner-provided, not price-verified by Rocket.
            </span>
          </label>
          <label className="block text-sm font-medium">
            Public links (one HTTPS URL per line)
            <textarea
              rows={3}
              value={links}
              onChange={(event) => setLinks(event.target.value)}
              className="mt-1 w-full rounded-lg border p-3"
            />
          </label>
          <div className="flex flex-wrap gap-3">
            <button
              disabled={busy}
              className="rounded-xl bg-neutral-950 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save profile"}
            </button>
            <Link
              to={`/apps/${id}`}
              className="rounded-xl border px-5 py-3 text-sm font-medium"
            >
              View public page
            </Link>
          </div>
        </form>
      )}
    </main>
  );
}
