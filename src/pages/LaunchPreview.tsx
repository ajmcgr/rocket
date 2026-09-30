import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "@/lib/router-compat";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import AppLogo from "@/components/AppLogo";
import { track } from "@/lib/analytics";
import { APP_CATEGORIES } from "@/lib/appCategories";
const supportedSources: { name: string; detail: string; emoji: string }[] = [
  { name: "Directories", detail: "Public listings with a clear app website", emoji: "🌐" },
  { name: "Launch", detail: "A trylaunch.ai product page", emoji: "🚀" },
  { name: "GitHub", detail: "A public repository URL", emoji: "💻" },
  { name: "News Sites", detail: "Hacker News stories and Show HN items", emoji: "📰" },
];

const STORAGE_KEY = "rocket:launch-preview-v1";
type Preview = {
  token: string;
  manual?: boolean;
  expires_at: string;
  outcome: "existing" | "ambiguous" | "new";
  app: {
    name: string;
    description: string;
    website_url: string;
    logo_url: string | null;
    categories: string[];
  };
  claimAfterAuth?: boolean;
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
      /* response may not be JSON */
    }
    throw new Error(detail || error.message);
  }
  if (result?.error) throw new Error(result.error);
  return result;
}

export default function LaunchPreview() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [url, setUrl] = useState("");
  const [manual, setManual] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [logo, setLogo] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const consumed = useRef(false);
  const tracked = useRef(false);
  useEffect(() => {
    try {
      const saved = JSON.parse(
        sessionStorage.getItem(STORAGE_KEY) || "null",
      ) as Preview | null;
      if (saved && new Date(saved.expires_at).getTime() > Date.now())
        setPreview(saved);
      else sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      sessionStorage.removeItem(STORAGE_KEY);
    }
  }, []);
  useEffect(() => {
    if (authLoading || tracked.current) return;
    tracked.current = true;
    track("launch_started", { signed_out: !user });
  }, [authLoading, user]);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setPreview(null);
    sessionStorage.removeItem(STORAGE_KEY);
    consumed.current = false;
    try {
      const result = await invoke("preview", {
        url,
        manual,
        name,
        description,
        category,
        logo_url: logo,
      });
      const next = result as Preview;
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setPreview(next);
      track("launch_url_submitted", { source: "launch", signed_out: !user });
    } catch (cause) {
      setError(
        (cause as Error).message ||
          "We could not read this app. Try another URL or add it manually.",
      );
    } finally {
      setBusy(false);
    }
  };
  const continueClaim = useCallback(
    async (candidate: Preview) => {
      if (!user) {
        const pending = { ...candidate, claimAfterAuth: true };
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(pending));
        setPreview(pending);
        navigate(`/login?next=${encodeURIComponent("/submit")}`);
        return;
      }
      if (consumed.current) return;
      consumed.current = true;
      setBusy(true);
      setError("");
      try {
        const result = await invoke("consume_preview", {
          token: candidate.token,
        });
        sessionStorage.removeItem(STORAGE_KEY);
        if (result.app_id)
          navigate(`/apps/add?app=${encodeURIComponent(result.app_id)}`);
        else
          setError(
            "This URL needs an identity review. No app was created; contact Rocket with the URL.",
          );
      } catch (cause) {
        consumed.current = false;
        setError((cause as Error).message || "Could not continue this claim.");
      } finally {
        setBusy(false);
      }
    },
    [navigate, user],
  );
  useEffect(() => {
    if (authLoading || !user || !preview?.claimAfterAuth || consumed.current)
      return;
    void continueClaim(preview);
  }, [authLoading, user, preview, continueClaim]);
  return (
    <div className="marketplace-page min-h-screen bg-[#f6f8fb] pb-20 text-neutral-900">
      <SiteHeader />
      <main className="mx-auto max-w-4xl px-5 pb-20 pt-12 sm:px-8 sm:pt-20">
        <p className="text-sm font-semibold text-sky-800">
          For vibe coders and developers
        </p>
        <h1 className="mt-3 font-display text-4xl leading-tight sm:text-6xl">
          Submit your app.
        </h1>
        <p className="mt-4 max-w-2xl text-base text-neutral-600 sm:text-lg">
          Show us where your app lives. We’ll find its public details first—no
          account required to preview.
        </p>
        <form
          onSubmit={submit}
          className="mt-9 rounded-[1.75rem] border border-neutral-200 bg-white p-6 shadow-[0_20px_60px_-45px_rgba(15,23,42,.5)] sm:p-8"
        >
          <label htmlFor="launch-url" className="block text-sm font-semibold">
            Your app website or Launch URL
          </label>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row">
            <input
              id="launch-url"
              type="text"
              inputMode="url"
              autoComplete="url"
              required
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://yourapp.com"
              className="min-h-12 min-w-0 flex-1 rounded-xl border border-neutral-300 px-4 text-base focus:border-sky-500 focus:outline-none"
            />
            <button
              disabled={busy}
              className="min-h-12 rounded-xl bg-[#167ac6] px-6 text-sm font-semibold text-white hover:bg-[#1268aa] disabled:opacity-50"
            >
              {busy ? "Finding your app…" : "Preview app"}
            </button>
          </div>
          <label className="mt-4 block max-w-sm text-sm font-medium">
            Category {manual ? "" : "(optional)"}
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              required={manual}
              className="mt-1 block min-h-11 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm"
            >
              <option value="">{manual ? "Choose a category" : "Let Rocket suggest one"}</option>
              {APP_CATEGORIES.map(({ name }) => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
          <button
            type="button"
            className="mt-4 text-sm font-medium text-sky-800 underline"
            onClick={() => setManual((value) => !value)}
          >
            {manual
              ? "Use automatic preview"
              : "Can’t read your site? Add details manually"}
          </button>
          {manual && (
            <div className="mt-5 grid gap-3 border-t border-neutral-100 pt-5 sm:grid-cols-2">
              <label className="text-sm">
                App name
                <input
                  required
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={240}
                  className="mt-1 w-full rounded-lg border p-3"
                />
              </label>
              <label className="text-sm sm:col-span-2">
                Description
                <textarea
                  required
                  minLength={20}
                  maxLength={2000}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  rows={3}
                  className="mt-1 w-full rounded-lg border p-3"
                />
              </label>
              <label className="text-sm sm:col-span-2">
                Logo URL from your website (optional)
                <input
                  type="url"
                  value={logo}
                  onChange={(event) => setLogo(event.target.value)}
                  className="mt-1 w-full rounded-lg border p-3"
                />
              </label>
            </div>
          )}
        </form>
        <section className="mt-8" aria-labelledby="submit-supported-sources">
          <h2 id="submit-supported-sources" className="text-xl font-semibold tracking-tight sm:text-2xl">URLs Rocket can use to submit apps</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-600">
            Paste a specific app page, not a directory homepage. Public pages must be accessible and include enough information to identify the app.
          </p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {supportedSources.map(({ name, detail, emoji }) => (
              <div key={name} className="flex items-start gap-3 rounded-2xl border border-neutral-200 bg-white p-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#eaf5fc] text-[#176f9f]">
                  <span aria-hidden="true" className="text-xl leading-none">{emoji}</span>
                </span>
                <div><h3 className="text-sm font-semibold">{name}</h3><p className="mt-1 text-xs leading-5 text-neutral-600">{detail}</p></div>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs leading-5 text-neutral-500">
            Product Hunt, Apple App Store, and Google Play listing URLs are not supported yet. Paste the app’s own website URL instead. Other public directory pages may work when they expose that website, but Rocket does not guarantee directory-specific imports.
          </p>
          <a href="https://launchdirectories.com/free-startup-directories" target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-sky-800 hover:underline">
            Browse external directories (not Rocket integrations) <span aria-hidden="true">→</span>
          </a>
        </section>
        {error && (
          <div
            role="alert"
            className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
          >
            {error}
            {!manual && (
              <button
                type="button"
                className="ml-2 font-semibold underline"
                onClick={() => setManual(true)}
              >
                Add manually
              </button>
            )}
          </div>
        )}
        {preview && (
          <section className="mt-8 overflow-hidden rounded-[1.75rem] border border-neutral-200 bg-white p-6 sm:p-8">
            <p className="text-sm font-semibold text-sky-800">
              {preview.outcome === "existing"
                ? "Already on Rocket"
                : preview.outcome === "ambiguous"
                  ? "Needs a closer look"
                  : preview.manual
                    ? "Your app preview"
                    : "We found your app"}
            </p>
            <div className="mt-5 flex items-start gap-4">
              <AppLogo
                name={preview.app.name}
                src={preview.app.logo_url}
                className="h-20 w-20"
              />
              <div className="min-w-0">
                <h2 className="font-display text-2xl sm:text-3xl">
                  {preview.app.name}
                </h2>
                <p className="mt-1 break-all text-sm text-neutral-500">
                  {preview.app.website_url}
                </p>
                {preview.app.categories[0] && (
                  <p className="mt-2 text-xs text-sky-800">
                    {preview.app.categories[0]}
                  </p>
                )}
              </div>
            </div>
            {preview.app.description && (
              <p className="mt-5 max-w-2xl whitespace-pre-wrap text-sm leading-relaxed text-neutral-600">
                {preview.app.description}
              </p>
            )}
            <div className="mt-6 border-t border-neutral-100 pt-5">
              <p className="mb-3 text-sm text-neutral-600">
                Is this your app? Claiming requires sign-in and proof of website
                control.
              </p>
              <button
                disabled={busy || preview.outcome === "ambiguous"}
                onClick={() => continueClaim(preview)}
                className="min-h-11 rounded-xl bg-sky-700 px-5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {busy ? "Continuing…" : "Claim & continue"}
              </button>
              {preview.outcome === "ambiguous" && (
                <p className="mt-2 text-sm text-neutral-600">
                  We will not guess which existing listing is yours.
                </p>
              )}
            </div>
          </section>
        )}
        <p className="mt-8 text-sm text-neutral-500">
          Already managing an app?{" "}
          <Link
            to="/your-apps"
            className="font-semibold text-sky-800 underline"
          >
            Open Your Apps
          </Link>
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
