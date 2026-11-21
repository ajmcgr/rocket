import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type Result = { authenticated: boolean; category: string | null; timestamp: string };

export default function AdminEscrowAuthDiagnostic() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  async function check() {
    setBusy(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("rocket-escrow", {
        body: { action: "diagnose_auth" },
      });
      const payload = error && "context" in error && error.context instanceof Response
        ? await error.context.json()
        : data;
      if (payload && typeof payload.authenticated === "boolean" && typeof payload.timestamp === "string") {
        setResult({ authenticated: payload.authenticated, category: payload.category ?? null, timestamp: payload.timestamp });
      } else {
        setResult({ authenticated: false, category: "internal_error", timestamp: new Date().toISOString() });
      }
    } catch {
      setResult({ authenticated: false, category: "internal_error", timestamp: new Date().toISOString() });
    } finally {
      setBusy(false);
    }
  }

  return <div>
    <p>Read-only production Escrow.com account check. No transaction is created.</p>
    <button type="button" disabled={busy} onClick={() => void check()}>{busy ? "Checking…" : "Verify Escrow.com authentication"}</button>
    {result && <p role="status">{result.authenticated ? "Authenticated" : `Not authenticated · ${result.category || "unknown"}`} · {new Date(result.timestamp).toLocaleString()}</p>}
  </div>;
}
