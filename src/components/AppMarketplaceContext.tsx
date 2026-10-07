import { useEffect, useState } from "react";
import { Link } from "@/lib/router-compat";
import { useAuth } from "@/contexts/AuthContext";
import { marketplaceRpc, marketplaceTable } from "@/lib/marketplace";
import type { Tables } from "@/integrations/supabase/types";
import MarketplaceFollow from "./MarketplaceFollow";
import { MarketplaceListRow } from "./MarketplaceCards";
import { useSavedAppControls } from "@/hooks/useSavedAppControls";
type Detail = {
  pricing_kind: string;
  billing_model: string;
  outcome: string | null;
  prerequisites: string | null;
  additional_costs: string | null;
  support_url: string | null;
  privacy_url: string | null;
};
export default function AppMarketplaceContext({ appId }: { appId: string }) {
  const { user } = useAuth();
  const [details, setDetails] = useState<Detail | null>(null),
    [developer, setDeveloper] = useState<{
      username: string;
      full_name: string;
    } | null>(null);
  const [more, setMore] = useState<Tables<"public_apps">[]>([]),
    [releases, setReleases] = useState<
      { id: string; version: string; notes: string; created_at: string }[]
    >([]);
  const [reason, setReason] = useState(""),
    [notice, setNotice] = useState(""),
    [reporting, setReporting] = useState(false),
    [busy, setBusy] = useState(false);
  const saved = useSavedAppControls(more.map((a) => a.id));
  useEffect(() => {
    let alive = true;
    setDetails(null);
    setDeveloper(null);
    setMore([]);
    setReleases([]);
    setNotice("");
    async function load() {
      const [d, p, r] = await Promise.all([
        marketplaceTable("public_marketplace_details")
          .select("*")
          .eq("app_id", appId)
          .maybeSingle(),
        marketplaceRpc("get_app_developer", { p_app_id: appId }),
        marketplaceTable("app_releases")
          .select("id,version,notes,created_at")
          .eq("app_id", appId)
          .order("created_at", { ascending: false })
          .limit(10),
      ]);
      if (!alive) return;
      if (!d.error) setDetails(d.data);
      if (!p.error) setDeveloper(p.data);
      if (!r.error) setReleases(r.data || []);
      if (p.data?.username) {
        const apps = await marketplaceRpc("get_public_member_apps", {
          p_username: p.data.username,
          p_offset: 0,
        });
        if (alive && !apps.error)
          setMore(
            (apps.data || [])
              .filter((a: Tables<"public_apps">) => a.id !== appId)
              .slice(0, 4),
          );
      }
    }
    void load().catch(() => {});
    return () => {
      alive = false;
    };
  }, [appId]);
  async function report(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const r = await marketplaceRpc("report_marketplace_app", {
      p_app_id: appId,
      p_reason: reason.trim(),
    });
    setNotice(
      r.error
        ? "Report could not be sent. Please retry."
        : "Report sent to Rocket moderation.",
    );
    setBusy(false);
    if (!r.error) {
      setReporting(false);
      setReason("");
    }
  }
  return (
    <section
      className="mt-7 space-y-6 border-t pt-6"
      aria-label="App evaluation and developer"
    >
      {developer && (
        <div>
          <p className="text-sm">
            By{" "}
            <Link
              className="font-semibold text-sky-800 underline"
              to={`/@${developer.username}`}
            >
              {developer.full_name || `@${developer.username}`}
            </Link>
          </p>
          <MarketplaceFollow
            key={developer.username}
            target={`developer:${developer.username}`}
            label="developer"
          />
        </div>
      )}
      <MarketplaceFollow key={appId} target={`app:${appId}`} label="app" />
      {details && (
        <div>
          <h2 className="text-xl font-semibold">Before you use it</h2>
          <p className="mt-2 text-xs text-neutral-500">
            Supplied by the domain-verified owner; not a Rocket quality
            endorsement.
          </p>
          <dl className="mt-3 space-y-3">
            {[
              [
                "Pricing",
                details.pricing_kind === "unknown"
                  ? "Not supplied"
                  : details.pricing_kind,
              ],
              [
                "Billing",
                details.billing_model === "unknown"
                  ? "Not supplied"
                  : details.billing_model.replaceAll("_", " "),
              ],
              ["What you can do", details.outcome],
              ["Compatibility and prerequisites", details.prerequisites],
              ["Additional costs", details.additional_costs],
            ]
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <div key={k}>
                  <dt className="text-sm font-semibold">{k}</dt>
                  <dd className="whitespace-pre-wrap text-sm text-neutral-600">
                    {v}
                  </dd>
                </div>
              ))}
          </dl>
          <div className="mt-3 flex gap-4">
            {[
              ["Support", details.support_url],
              ["Privacy policy", details.privacy_url],
            ]
              .filter(([, url]) => url)
              .map(([label, url]) => (
                <a
                  key={label}
                  href={url!}
                  rel="noopener noreferrer"
                  target="_blank"
                  className="inline-flex min-h-11 items-center text-sm underline"
                >
                  {label} ↗
                </a>
              ))}
          </div>
        </div>
      )}
      {more.length > 0 && (
        <div>
          <h2 className="mb-3 text-xl font-semibold">
            More from this developer
          </h2>
          <div className="space-y-3">
            {more.map((app) => (
              <MarketplaceListRow key={app.id} app={app} {...saved(app.id)} />
            ))}
          </div>
        </div>
      )}
      {releases.length > 0 && (
        <div>
          <h2 className="text-xl font-semibold">Release notes</h2>
          {releases.map((r) => (
            <article className="mt-3 rounded-xl border p-4" key={r.id}>
              <h3 className="font-semibold">
                {r.version}{" "}
                <time className="text-sm font-normal text-neutral-500">
                  · {new Date(r.created_at).toLocaleDateString()}
                </time>
              </h3>
              <p className="mt-2 whitespace-pre-wrap text-sm">{r.notes}</p>
            </article>
          ))}
        </div>
      )}
      <div>
        {user ? (
          <button
            className="min-h-11 text-sm underline"
            onClick={() => setReporting(!reporting)}
          >
            Report app
          </button>
        ) : (
          <Link
            className="inline-flex min-h-11 items-center text-sm underline"
            to="/login"
          >
            Sign in to report this app
          </Link>
        )}
        {reporting && (
          <form onSubmit={report}>
            <label className="block text-sm">
              What should Rocket review?
              <textarea
                required
                minLength={10}
                maxLength={500}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="mt-2 block w-full rounded-lg border p-3"
              />
            </label>
            <button
              disabled={busy}
              className="mt-2 min-h-11 rounded-lg border px-4"
            >
              Send report
            </button>
          </form>
        )}
        {notice && (
          <p role="status" className="text-sm">
            {notice}
          </p>
        )}
      </div>
    </section>
  );
}
