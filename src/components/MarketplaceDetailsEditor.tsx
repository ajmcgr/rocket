import { useEffect, useState } from "react";
import { marketplaceRpc, marketplaceTable } from "@/lib/marketplace";
const empty = {
  pricing_kind: "unknown",
  billing_model: "unknown",
  outcome: "",
  prerequisites: "",
  additional_costs: "",
  support_url: "",
  privacy_url: "",
};
export default function MarketplaceDetailsEditor({ appId }: { appId: string }) {
  const [details, setDetails] = useState(empty),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [version, setVersion] = useState(""),
    [notes, setNotes] = useState("");
  const [ready, setReady] = useState(false),
    [releaseId, setReleaseId] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setReady(false);
    setDetails(empty);
    setNotice("");
    setVersion("");
    setNotes("");
    setReleaseId(null);
    void marketplaceTable("public_marketplace_details")
      .select("*")
      .eq("app_id", appId)
      .maybeSingle()
      .then((r) => {
        if (!alive) return;
        if (r.error)
          setNotice(
            "Evaluation settings unavailable. Do not save until the migration is installed.",
          );
        else {
          setDetails(
            Object.fromEntries(
              Object.keys(empty).map((k) => [
                k,
                r.data?.[k as keyof typeof empty] ||
                  empty[k as keyof typeof empty],
              ]),
            ) as typeof empty,
          );
          setReady(true);
        }
      });
    return () => {
      alive = false;
    };
  }, [appId]);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const r = await marketplaceRpc("set_app_marketplace_details", {
      p_app_id: appId,
      p_details: details,
    });
    setNotice(
      r.error
        ? r.error.message
        : "Evaluation details saved. No checkout or verification settings changed.",
    );
    setBusy(false);
  }
  async function release(e: React.FormEvent) {
    e.preventDefault();
    if (
      !window.confirm(
        "Publish these release notes and notify people who explicitly follow this app or developer?",
      )
    )
      return;
    setBusy(true);
    const id = releaseId || crypto.randomUUID();
    setReleaseId(id);
    const r = await marketplaceRpc("publish_app_release", {
      p_id: id,
      p_app_id: appId,
      p_version: version,
      p_notes: notes,
    });
    setNotice(
      r.error
        ? r.error.message
        : "Release published. Opted-in followers receive one inbox update.",
    );
    if (!r.error) {
      setVersion("");
      setNotes("");
      setReleaseId(null);
    }
    setBusy(false);
  }
  return (
    <section className="mt-8 space-y-6 rounded-2xl border p-6">
      <h2 className="text-xl font-semibold">Marketplace evaluation</h2>
      <p className="text-sm text-neutral-600">
        These are owner-declared details, not verified quality or payment
        activation.
      </p>
      <form onSubmit={save} className="space-y-4">
        <fieldset disabled={!ready || busy} className="space-y-4">
          <label className="block text-sm">
            Pricing
            <select
              className="mt-1 block w-full rounded-lg border p-3"
              value={details.pricing_kind}
              onChange={(e) =>
                setDetails((d) => ({ ...d, pricing_kind: e.target.value }))
              }
            >
              {["unknown", "free", "freemium", "paid"].map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            Billing model
            <select
              className="mt-1 block w-full rounded-lg border p-3"
              value={details.billing_model}
              onChange={(e) =>
                setDetails((d) => ({ ...d, billing_model: e.target.value }))
              }
            >
              {["unknown", "one_time", "subscription", "both"].map((v) => (
                <option key={v} value={v}>
                  {v.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </label>
          {(
            [
              ["outcome", "Outcome", 500],
              ["prerequisites", "Compatibility and prerequisites", 1000],
              ["additional_costs", "Additional costs", 500],
              ["support_url", "Support URL (HTTPS)", 2000],
              ["privacy_url", "Privacy URL (HTTPS)", 2000],
            ] as const
          ).map(([k, label, max]) => (
            <label key={k} className="block text-sm">
              {label}
              <input
                type={k.endsWith("_url") ? "url" : "text"}
                maxLength={max}
                value={details[k]}
                onChange={(e) =>
                  setDetails((d) => ({ ...d, [k]: e.target.value }))
                }
                className="mt-1 block w-full rounded-lg border p-3"
              />
            </label>
          ))}
          <button className="min-h-11 rounded-lg border px-4">
            Save evaluation details
          </button>
        </fieldset>
      </form>
      <form onSubmit={release} className="space-y-3 border-t pt-5">
        <h3 className="font-semibold">Publish a meaningful update</h3>
        <label className="block text-sm">
          Version / update title
          <input
            required
            maxLength={80}
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            className="mt-1 block w-full rounded-lg border p-3"
          />
        </label>
        <label className="block text-sm">
          Release notes
          <textarea
            required
            minLength={20}
            maxLength={2000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="mt-1 block w-full rounded-lg border p-3"
          />
        </label>
        <button
          disabled={!ready || busy}
          className="min-h-11 rounded-lg border px-4"
        >
          Publish update
        </button>
      </form>
      {notice && (
        <p role="status" className="text-sm">
          {notice}
        </p>
      )}
    </section>
  );
}
