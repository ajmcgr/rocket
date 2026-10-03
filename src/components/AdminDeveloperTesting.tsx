import { useEffect, useRef, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";

// Mount only after the existing admin snapshot RPC authorizes /admin.
// The invitation endpoint independently repeats the admin + operator checks.
export default function AdminDeveloperTesting() {
  const [allowed, setAllowed] = useState(false);
  const [email, setEmail] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  useEffect(() => {
    let cancelled = false;
    supabase.functions
      .invoke("rocket-connect-developer", { method: "GET" })
      .then(({ data, error }) => {
        if (!cancelled) {
          setAllowed(!error && data?.operator === true);
          if (error || !data?.operator)
            setError(
              "Invitation tools require an authorized developer operator.",
            );
        }
      })
      .catch(() => {
        if (!cancelled) setError("Testing tools are temporarily unavailable.");
      });
    return () => {
      cancelled = true;
    };
  }, []);
  async function invite(event: FormEvent) {
    event.preventDefault();
    if (!allowed || pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    setUrl("");
    try {
      const bytes = crypto.getRandomValues(new Uint8Array(32));
      const token = btoa(String.fromCharCode(...bytes))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/g, "");
      const result = await supabase.functions.invoke(
        "rocket-connect-developer",
        { body: { action: "invite", email, token } },
      );
      if (result.error || result.data?.error || !result.data?.invitation_url)
        throw new Error("Invitation unavailable");
      setUrl(result.data.invitation_url);
    } catch {
      setError(
        "Could not create invitation. Confirm admin and operator authorization, then try again.",
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="rocket-admin-panel">
      <h2>Developer testing</h2>
      <p className="rocket-admin-muted">
        Internal QA only. Invitations grant test-developer access, not paid
        membership or production payment readiness.
      </p>
      {allowed && (
        <form onSubmit={invite}>
          <label>
            Test developer email
            <input
              required
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <button disabled={busy}>
            {busy ? "Creating…" : "Create test invitation"}
          </button>
        </form>
      )}
      {error && <p role="alert">{error}</p>}
      {url && (
        <div>
          <p>Share this invitation once.</p>
          <code style={{ overflowWrap: "anywhere" }}>{url}</code>
          <button
            onClick={() =>
              navigator.clipboard
                .writeText(url)
                .catch(() => setError("Select and copy the invitation link."))
            }
          >
            Copy invitation
          </button>
        </div>
      )}
    </section>
  );
}
