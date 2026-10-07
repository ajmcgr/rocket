import { useEffect, useRef, useState } from "react";
import "./LaunchPreview.css";
import { Link, useNavigate } from "@/lib/router-compat";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import SiteHeader from "@/components/SiteHeader";
import AppLogo from "@/components/AppLogo";
import { track } from "@/lib/analytics";
import { APP_CATEGORIES } from "@/lib/appCategories";
import {
  emptySubmission,
  submissionSlug,
  validateSubmission,
  youtubeUrl,
  SUBMISSION_PLATFORMS,
  type SubmissionDetails,
} from "../../supabase/functions/_shared/appSubmission";

const DRAFT_KEY = "rocket:app-submission-v2";
const STORAGE_KEY = "rocket:launch-preview-v1";
const steps = [
  "Basic Information",
  "Media & Assets",
  "App Details",
  "Review & Submit",
];
const inputClass =
  "mt-2 min-h-12 w-full min-w-0 rounded-xl border border-border bg-background px-4 py-3 text-base font-normal text-foreground sm:text-sm focus:border-[#167ac6] focus:outline-none";
const primary =
  "inline-flex min-h-12 items-center justify-center rounded-xl bg-[#167ac6] px-6 py-3 text-sm font-semibold text-white hover:bg-[#1268aa] disabled:opacity-50";
const secondary =
  "inline-flex min-h-12 items-center justify-center rounded-xl border border-border bg-transparent px-5 py-3 text-sm font-semibold disabled:opacity-50";
type Preview = {
  token: string;
  expires_at: string;
  outcome: "existing" | "ambiguous" | "new";
  app: {
    id?: string;
    name: string;
    description: string;
    website_url: string;
    logo_url: string | null;
    categories: string[];
  };
  publishAfterAuth?: boolean;
};
type Draft = {
  url: string;
  details: SubmissionDetails;
  step: number;
  editing: boolean;
};
async function invoke(action: string, data: Record<string, unknown>) {
  const { data: result, error } = await supabase.functions.invoke(
    "rocket-apps",
    { body: { action, ...data } },
  );
  if (error) {
    let detail = "";
    try {
      detail =
        (await (error as { context?: Response }).context?.json())?.error || "";
    } catch {
      /* Non-JSON response. */
    }
    throw new Error(detail || error.message);
  }
  if (result?.error) throw new Error(result.error);
  return result;
}
function Field({
  label,
  value,
  onChange,
  hint,
  multiline = false,
  maxLength = 2048,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  multiline?: boolean;
  maxLength?: number;
}) {
  return (
    <label className="block text-sm font-semibold">
      {label}
      {multiline ? (
        <textarea
          className={inputClass}
          rows={6}
          value={value}
          maxLength={maxLength}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          className={inputClass}
          value={value}
          maxLength={maxLength}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {hint && (
        <span className="mt-2 block text-xs font-normal leading-5 text-muted-foreground">
          {hint}
        </span>
      )}
    </label>
  );
}
function ListField({
  label,
  value,
  onChange,
  hint,
  lines = false,
}: {
  label: string;
  value: string[];
  onChange: (value: string[]) => void;
  hint: string;
  lines?: boolean;
}) {
  const [text, setText] = useState(value.join(lines ? "\n" : ", "));
  useEffect(() => {
    const parsed = text
      .split(lines ? "\n" : ",")
      .map((v) => v.trim())
      .filter(Boolean);
    if (JSON.stringify(parsed) !== JSON.stringify(value))
      setText(value.join(lines ? "\n" : ", "));
  }, [value]);
  return (
    <Field
      label={label}
      value={text}
      multiline={lines}
      hint={hint}
      onChange={(text) => {
        setText(text);
        onChange(
          text
            .split(lines ? "\n" : ",")
            .map((v) => v.trim())
            .filter(Boolean),
        );
      }}
    />
  );
}
export default function LaunchPreview() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [url, setUrl] = useState("");
  const [details, setDetails] = useState(emptySubmission);
  const [step, setStep] = useState(0);
  const [editing, setEditing] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [ready, setReady] = useState(false);
  const consuming = useRef(false);
  const errorRef = useRef<HTMLDivElement>(null);
  const set = <K extends keyof SubmissionDetails>(
    key: K,
    value: SubmissionDetails[K],
  ) => setDetails((old) => ({ ...old, [key]: value }));
  useEffect(() => {
    try {
      const saved = JSON.parse(
        sessionStorage.getItem(DRAFT_KEY) || "null",
      ) as Draft | null;
      if (saved?.details && typeof saved.url === "string") {
        setUrl(saved.url);
        setDetails({
          ...emptySubmission(),
          ...saved.details,
          submission_type: "founder",
        });
        setStep(Math.max(0, Math.min(3, saved.step || 0)));
        setEditing(saved.editing);
      }
      const pending = JSON.parse(
        sessionStorage.getItem(STORAGE_KEY) || "null",
      ) as Preview | null;
      if (pending && new Date(pending.expires_at).getTime() > Date.now())
        setPreview(pending);
      else sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      sessionStorage.removeItem(DRAFT_KEY);
      sessionStorage.removeItem(STORAGE_KEY);
    }
    setReady(true);
  }, []);
  useEffect(() => {
    if (ready)
      sessionStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({ url, details, step, editing }),
      );
  }, [ready, url, details, step, editing]);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  const readWebsite = async () => {
    setBusy(true);
    setError("");
    setNotice("");
    setPreview(null);
    sessionStorage.removeItem(STORAGE_KEY);
    try {
      const result = (await invoke("preview", {
        url,
        category: details.categories[0] || "",
      })) as Preview;
      setPreview(result);
      if (result.outcome === "new") {
        setUrl(result.app.website_url);
        setDetails((old) => ({
          ...old,
          name: result.app.name,
          slug: old.slug || submissionSlug(result.app.name),
          description: result.app.description,
          tagline: result.app.description.split(/[.!?]\s/)[0].slice(0, 200),
          logo_url: result.app.logo_url || "",
          categories: result.app.categories
            .filter((c) =>
              APP_CATEGORIES.some((category) => category.name === c),
            )
            .slice(0, 3),
          platforms: old.platforms.length ? old.platforms : ["web"],
        }));
        setEditing(true);
        setStep(0);
        setNotice(
          "We found your app. Review the details, add media, then publish.",
        );
      }
      track("launch_url_submitted", { source: "website", signed_out: !user });
    } catch (cause) {
      setError(
        (cause as Error).message ||
          "We could not read this app. Add its details manually instead.",
      );
    } finally {
      setBusy(false);
    }
  };
  const consume = async (candidate: Preview) => {
    if (!user || consuming.current) return;
    consuming.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await invoke("consume_preview", {
        token: candidate.token,
        publish: true,
      });
      if (!result.app_id || !result.published)
        throw new Error(
          "This listing needs an identity review. No public app was created.",
        );
      sessionStorage.removeItem(STORAGE_KEY);
      sessionStorage.removeItem(DRAFT_KEY);
      track("launch_new_app_created", { app_id: result.app_id });
      navigate(`/apps/${encodeURIComponent(result.slug || result.app_id)}`);
    } catch (cause) {
      consuming.current = false;
      setError(
        (cause as Error).message ||
          "Could not publish your app. Your draft is saved.",
      );
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (
      ready &&
      !authLoading &&
      user &&
      preview?.publishAfterAuth &&
      !consuming.current
    )
      void consume(preview);
    // Only a previously confirmed publish intent can resume after sign-in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, authLoading, user, preview]);
  const publish = async () => {
    setBusy(true);
    setError("");
    try {
      const checked = validateSubmission(details);
      const candidate = (await invoke("preview", {
        url,
        manual: true,
        details: checked,
        category: checked.categories[0],
      })) as Preview;
      if (candidate.outcome !== "new") {
        setPreview(candidate);
        setEditing(false);
        return;
      }
      if (!user) {
        sessionStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ ...candidate, publishAfterAuth: true }),
        );
        navigate(`/login?next=${encodeURIComponent("/submit")}`);
        return;
      }
      await consume(candidate);
    } catch (cause) {
      setError(
        (cause as Error).message ||
          "Could not publish your app. Your draft is saved.",
      );
    } finally {
      setBusy(false);
    }
  };
  const upload = async (
    files: FileList | null,
    kind: "logo_url" | "hero_url" | "screenshots",
  ) => {
    if (!files?.length) return;
    if (!user) {
      setError(
        "Sign in before uploading images. Your draft is saved; you can also use image URLs from your website.",
      );
      return;
    }
    setBusy(true);
    setError("");
    try {
      const selected = Array.from(files);
      if (
        kind === "screenshots" &&
        selected.length + details.screenshots.length > 6
      )
        throw new Error("Add no more than 6 screenshots");
      if (
        selected.some(
          (file) =>
            !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
            file.size > 2_000_000,
        )
      )
        throw new Error("Use PNG, JPEG or WebP images, up to 2 MB each");
      const uploaded: string[] = [];
      for (const file of selected) {
        const extension =
          file.type === "image/png"
            ? "png"
            : file.type === "image/jpeg"
              ? "jpg"
              : "webp";
        const path = `${user.id}/app-submissions/${crypto.randomUUID()}.${extension}`;
        const result = await supabase.storage
          .from("rocket-images")
          .upload(path, file, { contentType: file.type, upsert: false });
        if (result.error) throw result.error;
        uploaded.push(
          supabase.storage.from("rocket-images").getPublicUrl(path).data
            .publicUrl,
        );
      }
      if (kind === "screenshots")
        set("screenshots", [...details.screenshots, ...uploaded]);
      else set(kind, uploaded[0]);
    } catch (cause) {
      setError((cause as Error).message || "Upload failed. Try another image.");
    } finally {
      setBusy(false);
    }
  };
  const next = (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setNotice("");
    try {
      if (
        step === 0 &&
        (details.name.trim().length < 2 ||
          details.tagline.trim().length < 2 ||
          !url.trim())
      )
        throw new Error("Add an app name, tagline and website URL");
      if (step === 1) {
        if (!details.logo_url || !details.hero_url)
          throw new Error("Add an app icon and hero image");
        youtubeUrl(details.video_url);
      }
      if (step === 2) validateSubmission(details);
      if (step === 3) {
        void publish();
        return;
      }
      setStep((old) => Math.min(old + 1, 3));
    } catch (cause) {
      setError((cause as Error).message);
    }
  };
  const toggle = (
    key: "categories" | "platforms",
    value: string,
    max: number,
  ) =>
    setDetails((old) => ({
      ...old,
      [key]: old[key].includes(value)
        ? old[key].filter((item) => item !== value)
        : old[key].length < max
          ? [...old[key], value]
          : old[key],
    }));
  const imageField = (
    kind: "logo_url" | "hero_url",
    label: string,
    hint: string,
  ) => (
    <div className="space-y-3 rounded-xl border border-border p-4">
      <Field
        label={label}
        value={details[kind]}
        onChange={(value) => set(kind, value)}
        hint={`${hint} Upload an image or paste an HTTPS image URL from your app website.`}
      />
      <label className="block text-sm font-medium">
        Upload {kind === "logo_url" ? "app icon" : "hero image"}
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          disabled={busy}
          className="mt-2 block max-w-full text-sm"
          onChange={(e) => {
            void upload(e.target.files, kind);
            e.target.value = "";
          }}
        />
      </label>
      {details[kind] && (
        <img
          src={details[kind]}
          alt={`${label} preview`}
          className={
            kind === "logo_url"
              ? "h-20 w-20 rounded-xl object-contain"
              : "max-h-48 w-full rounded-xl object-contain"
          }
        />
      )}
    </div>
  );
  return (
    <div className="marketplace-page rocket-submission-page min-h-screen bg-background pb-20 text-foreground">
      <SiteHeader />
      <main className="mx-auto max-w-4xl px-5 pb-20 pt-10 sm:px-8 sm:pt-14">
        <header>
          <p className="text-sm font-semibold text-[#167ac6]">
            For vibe coders and developers
          </p>
          <h1 className="mt-3 font-display text-4xl font-bold tracking-tight sm:text-5xl">
            Submit my app.
          </h1>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            Add your app to Rocket for free. Start with AI-assisted details or
            enter them yourself. Your listing goes live as soon as you
            publish—no launch date or queue.
          </p>
        </header>
        <section
          className="mt-8 rounded-2xl border border-border bg-card p-5 sm:p-6"
          aria-label="AI-assisted app submission"
        >
          <label htmlFor="launch-url" className="text-sm font-semibold">
            Your app website or Launch URL
          </label>
          <div className="mt-2 flex flex-col gap-3 sm:flex-row">
            <input
              id="launch-url"
              className={`${inputClass} mt-0 flex-1`}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              inputMode="url"
              autoComplete="url"
              placeholder="https://yourapp.com"
            />
            <button
              type="button"
              className={primary}
              disabled={busy || !url.trim()}
              onClick={() => void readWebsite()}
            >
              {busy ? "Finding your app…" : "Add with AI"}
            </button>
          </div>
          <button
            type="button"
            className="mt-4 text-sm font-semibold text-[#167ac6] underline"
            disabled={busy}
            onClick={() => {
              setEditing(true);
              setPreview(null);
              setError("");
              setStep(0);
            }}
          >
            Add details manually
          </button>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">
            AI-assisted import reads public website metadata. Review every field
            before publishing. Importing never verifies ownership.
          </p>
        </section>
        {error && (
          <div
            ref={errorRef}
            role="alert"
            tabIndex={-1}
            className="mt-5 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-100"
          >
            {error}
            <button
              type="button"
              className="ml-2 font-semibold underline"
              onClick={() => {
                setEditing(true);
                setStep(0);
              }}
            >
              Edit manually
            </button>
          </div>
        )}
        {notice && (
          <p role="status" className="mt-5 text-sm text-muted-foreground">
            {notice}
          </p>
        )}
        {preview && preview.outcome !== "new" && (
          <section className="mt-6 rounded-2xl border border-border bg-card p-6">
            <h2 className="text-xl font-bold">
              {preview.outcome === "existing"
                ? "Already on Rocket"
                : "Needs an identity review"}
            </h2>
            <div className="mt-4 flex gap-4">
              <AppLogo
                name={preview.app.name}
                src={preview.app.logo_url}
                className="h-16 w-16"
              />
              <div>
                <h3 className="font-semibold">{preview.app.name}</h3>
                <p className="break-all text-sm text-muted-foreground">
                  {preview.app.website_url}
                </p>
              </div>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              {preview.outcome === "existing"
                ? "We won't create a duplicate or change this listing. Verify website control to manage it."
                : "More than one listing matches this website. Contact Rocket so we can resolve it safely."}
            </p>
            {preview.outcome === "existing" && (
              <Link
                to={preview.app.id
                  ? `/apps/add?app=${encodeURIComponent(preview.app.id)}`
                  : `/apps/add?url=${encodeURIComponent(preview.app.website_url)}`}
                className={`${primary} mt-5`}
              >
                Claim existing app
              </Link>
            )}
          </section>
        )}
        {editing && (
          <form
            onSubmit={next}
            className="mt-8 rounded-2xl border border-border bg-card p-5 sm:p-8"
          >
            <ol
              className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4"
              aria-label="Submission progress"
            >
              {steps.map((label, index) => (
                <li
                  key={label}
                  aria-current={step === index ? "step" : undefined}
                  className={`rounded-xl px-3 py-3 text-xs font-semibold ${step === index ? "bg-neutral-200 text-neutral-900 dark:bg-neutral-700 dark:text-white" : "text-muted-foreground"}`}
                >
                  {index + 1}. {label}
                </li>
              ))}
            </ol>
            <h2 className="text-2xl font-bold tracking-tight">{steps[step]}</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {
                [
                  "Tell us about your app.",
                  "Show people what your app looks like. PNG, JPEG or WebP, up to 2 MB each.",
                  "Help the right people discover your app.",
                  "Check your listing. Publishing is free and immediate.",
                ][step]
              }
            </p>
            <div className="mt-6 space-y-6">
              {step === 0 && (
                <>
                  <Field
                    label="App name *"
                    value={details.name}
                    maxLength={120}
                    onChange={(value) =>
                      setDetails((old) => ({
                        ...old,
                        name: value,
                        slug:
                          old.slug === submissionSlug(old.name) || !old.slug
                            ? submissionSlug(value)
                            : old.slug,
                      }))
                    }
                  />
                  <Field
                    label="Tagline *"
                    value={details.tagline}
                    maxLength={200}
                    onChange={(value) => set("tagline", value)}
                    hint="One clear sentence describing what your app does."
                  />
                  <Field label="Website URL *" value={url} onChange={setUrl} />
                  <Field
                    label="Developer @handle (optional)"
                    value={details.developer_handle}
                    maxLength={31}
                    onChange={(value) => set("developer_handle", value)}
                    hint="Public attribution only. This is not an ownership verification badge."
                  />
                </>
              )}
              {step === 1 && (
                <>
                  {imageField(
                    "logo_url",
                    "App icon *",
                    "Recommended: 512 × 512 px.",
                  )}
                  {imageField(
                    "hero_url",
                    "Hero image *",
                    "Recommended: 1200 × 630 px.",
                  )}
                  <div className="rounded-xl border border-border p-4">
                    <label className="block text-sm font-semibold">
                      Screenshots (up to 6 images)
                      <input
                        type="file"
                        multiple
                        accept="image/png,image/jpeg,image/webp"
                        className="mt-3 block max-w-full text-sm"
                        disabled={busy}
                        onChange={(e) => {
                          void upload(e.target.files, "screenshots");
                          e.target.value = "";
                        }}
                      />
                    </label>
                    <ListField
                      label="Screenshot URLs (one per line)"
                      lines
                      value={details.screenshots}
                      onChange={(value) => set("screenshots", value)}
                      hint="Use images from your app website, or upload above. Recommended: 3–6 screenshots."
                    />
                    <div className="mt-3 grid grid-cols-3 gap-3">
                      {details.screenshots.map((src, index) => (
                        <div key={`${src}:${index}`}>
                          <img
                            src={src}
                            alt={`Screenshot ${index + 1}`}
                            className="aspect-video w-full rounded-lg object-cover"
                          />
                          <button
                            type="button"
                            className="mt-1 text-xs underline"
                            onClick={() =>
                              set(
                                "screenshots",
                                details.screenshots.filter(
                                  (_, i) => i !== index,
                                ),
                              )
                            }
                          >
                            Remove {index + 1}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                  <Field
                    label="Demo video URL (optional)"
                    value={details.video_url}
                    onChange={(value) => set("video_url", value)}
                    hint="Paste a YouTube watch, share or Shorts URL."
                  />
                  {!user && (
                    <Link
                      className="inline-block text-sm font-semibold text-[#167ac6] underline"
                      to="/login?next=%2Fsubmit"
                    >
                      Sign in to upload images—your draft is saved
                    </Link>
                  )}
                </>
              )}
              {step === 2 && (
                <>
                  <Field
                    label="Description *"
                    multiline
                    value={details.description}
                    maxLength={2000}
                    onChange={(value) => set("description", value)}
                    hint="Explain who it's for, what it does and why it's useful. 20–2,000 characters."
                  />
                  <fieldset>
                    <legend className="mb-3 text-sm font-semibold">
                      Categories * (up to 3)
                    </legend>
                    <div className="grid max-h-64 grid-cols-2 gap-3 overflow-y-auto rounded-xl border border-border p-4">
                      {APP_CATEGORIES.map(({ name }) => (
                        <label
                          key={name}
                          className="flex items-start gap-2 text-sm"
                        >
                          <input
                            type="checkbox"
                            checked={details.categories.includes(name)}
                            disabled={
                              !details.categories.includes(name) &&
                              details.categories.length >= 3
                            }
                            onChange={() => toggle("categories", name, 3)}
                            className="mt-1"
                          />
                          {name}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <fieldset>
                    <legend className="mb-3 text-sm font-semibold">
                      Platforms *
                    </legend>
                    <div className="flex flex-wrap gap-4">
                      {SUBMISSION_PLATFORMS.map(({ id, label }) => (
                        <label
                          key={id}
                          className="flex items-center gap-2 text-sm"
                        >
                          <input
                            type="checkbox"
                            checked={details.platforms.includes(id)}
                            onChange={() => toggle("platforms", id, 7)}
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <ListField
                    label="Tags (up to 5)"
                    value={details.tags}
                    onChange={(value) => set("tags", value)}
                    hint="Separate tags with commas, e.g. productivity, AI, collaboration."
                  />
                  <Field
                    label="URL slug *"
                    value={details.slug}
                    maxLength={80}
                    onChange={(value) => set("slug", value)}
                    hint={`Your app page: tryrocket.ai/apps/${details.slug || "your-app"}`}
                  />
                  <Field
                    label="Pricing (optional)"
                    value={details.pricing_display}
                    maxLength={60}
                    onChange={(value) => set("pricing_display", value)}
                    hint="For example: Free, Freemium, or $19/month."
                  />
                  <div className="grid gap-6 sm:grid-cols-2">
                    <Field
                      label="Discount coupon code (optional)"
                      value={details.coupon_code}
                      maxLength={50}
                      onChange={(value) => set("coupon_code", value)}
                    />
                    <Field
                      label="Discount description (optional)"
                      value={details.coupon_description}
                      maxLength={200}
                      onChange={(value) => set("coupon_description", value)}
                    />
                  </div>
                  <ListField
                    label="Build stack (optional)"
                    value={details.stack}
                    onChange={(value) => set("stack", value)}
                    hint="Up to 10 technologies, separated by commas."
                  />
                  <ListField
                    label="App languages (optional)"
                    value={details.languages}
                    onChange={(value) => set("languages", value)}
                    hint="Up to 5 languages, separated by commas."
                  />
                </>
              )}
              {step === 3 && (
                <>
                  <div className="overflow-hidden rounded-2xl border border-border">
                    <img
                      src={details.hero_url}
                      alt={`${details.name} hero`}
                      className="aspect-[1200/630] w-full object-cover"
                    />
                    <div className="space-y-4 p-5">
                      <div className="flex items-center gap-4">
                        <AppLogo
                          name={details.name}
                          src={details.logo_url}
                          className="h-16 w-16"
                        />
                        <div className="min-w-0">
                          <h3 className="text-xl font-bold">{details.name}</h3>
                          <p className="text-sm text-muted-foreground">
                            {details.tagline}
                          </p>
                        </div>
                      </div>
                      <p className="whitespace-pre-wrap text-sm leading-6">
                        {details.description}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {details.categories.join(" · ")} ·{" "}
                        {details.platforms.join(" · ")}
                      </p>
                      <p className="break-all text-sm">{url}</p>
                      <p className="break-all text-sm">
                        tryrocket.ai/apps/{details.slug}
                      </p>
                      {details.developer_handle && (
                        <p className="text-sm">@{details.developer_handle}</p>
                      )}
                      {details.video_url && (
                        <p className="break-all text-sm">
                          YouTube demo: {details.video_url}
                        </p>
                      )}
                      <p className="text-sm text-muted-foreground">
                        {details.screenshots.length} screenshots
                      </p>
                    </div>
                  </div>
                  <p className="rounded-xl border border-border p-4 text-sm leading-6 text-muted-foreground">
                    Your app will be public immediately. Submission does not
                    verify ownership, revenue or customer numbers. Rocket ID and
                    Buy with Rocket require separate eligibility and onboarding.
                  </p>
                </>
              )}
            </div>
            <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
              <div className="flex flex-wrap gap-3">
                {step > 0 && (
                  <button
                    type="button"
                    className={secondary}
                    disabled={busy}
                    onClick={() => {
                      setStep((old) => old - 1);
                      setError("");
                    }}
                  >
                    Back
                  </button>
                )}
                <button
                  type="button"
                  className={secondary}
                  disabled={busy}
                  onClick={() =>
                    setNotice(
                      "Draft saved in this browser tab. You can return to /submit to continue.",
                    )
                  }
                >
                  Save draft
                </button>
              </div>
              <button className={primary} disabled={busy}>
                {busy
                  ? "Working…"
                  : step === 3
                    ? user
                      ? "Publish app"
                      : "Sign in & publish"
                    : "Next"}
              </button>
            </div>
          </form>
        )}
        <section className="mt-9" aria-labelledby="submit-supported-sources">
          <h2 id="submit-supported-sources" className="text-xl font-semibold">
            URLs Rocket can use to submit apps
          </h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Use your app website, a trylaunch.ai product page, a GitHub
            repository with a product website, or a Hacker News story linking to
            the app. Product Hunt, Apple App Store, and Google Play listing URLs
            are not supported yet. Paste the app’s own website URL instead.
          </p>
        </section>
        <p className="mt-8 text-sm text-muted-foreground">
          Already managing an app?{" "}
          <Link
            to="/your-apps"
            className="font-semibold text-[#167ac6] underline"
          >
            Open My Apps
          </Link>
        </p>
      </main>
    </div>
  );
}
