import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { edgeFunctionErrorMessage } from "@/lib/edgeFunctionError";

const CLIENTS = ["Claude", "ChatGPT", "Cursor", "Windsurf", "VS Code"];
const empty = { mcp_url: "", api_docs_url: "", github_url: "", deployment_url: "", supported_clients: [] as string[] };

export default function AgentIntegrationsPanel({ appId }: { appId: string }) {
  const [fields, setFields] = useState(empty);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    Promise.all([
      supabase.from("app_agent_integrations")
        .select("mcp_url,api_docs_url,github_url,deployment_url,supported_clients")
        .eq("app_id", appId).maybeSingle(),
      supabase.from("public_app_sources").select("source_url")
        .eq("app_id", appId).eq("source_type", "github").limit(1).maybeSingle(),
    ]).then(([integration, source]) => {
      if (!active) return;
      if (integration.error || source.error) throw integration.error || source.error;
      setFields({
        mcp_url: integration.data?.mcp_url || "",
        api_docs_url: integration.data?.api_docs_url || "",
        github_url: integration.data?.github_url || source.data?.source_url || "",
        deployment_url: integration.data?.deployment_url || "",
        supported_clients: integration.data?.supported_clients || [],
      });
    }).catch(() => {
      if (active) setError("Agent integrations could not be loaded.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [appId]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const { data, error: requestError } = await supabase.functions.invoke("rocket-apps", {
        body: { action: "update_agent_integrations", app_id: appId, ...fields },
      });
      if (requestError || data?.error)
        throw new Error(data?.error || await edgeFunctionErrorMessage(requestError, "Could not save agent integrations"));
      setNotice(data?.status === "removed" ? "Agent integrations removed." : "Agent integrations saved.");
    } catch (failure) {
      setError(await edgeFunctionErrorMessage(failure, "Could not save agent integrations"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section id="agent-integrations" aria-labelledby="agent-integrations-heading" className="rounded-[1.5rem] border border-neutral-200 bg-white p-5 shadow-sm sm:p-6">
      <h2 id="agent-integrations-heading" className="text-xl font-semibold">Agent Integrations</h2>
      <p className="mt-2 text-sm text-neutral-600">Add public links for people who want to use your app with AI agents. This is free. Rocket does not test these connections or ask for credentials.</p>
      {loading ? <p role="status" className="mt-5 text-sm text-neutral-500">Loading integrations…</p> : (
        <form onSubmit={save} className="mt-5 space-y-4">
          {([
            ["mcp_url", "MCP server URL", "https://your-app.com/mcp"],
            ["api_docs_url", "API documentation URL", "https://your-app.com/docs"],
            ["github_url", "GitHub repository URL", "https://github.com/owner/repository"],
            ["deployment_url", "Deployment instructions URL", "https://your-app.com/deploy"],
          ] as const).map(([key, label, placeholder]) => (
            <label key={key} className="block text-sm font-medium text-neutral-800">
              {label}
              <input type="url" inputMode="url" maxLength={2048} value={fields[key]}
                onChange={(event) => setFields((current) => ({ ...current, [key]: event.target.value }))}
                placeholder={placeholder} className="mt-1 block min-h-11 w-full rounded-xl border border-neutral-200 bg-white px-3 text-sm" />
            </label>
          ))}
          <fieldset>
            <legend className="text-sm font-medium text-neutral-800">Supported AI clients</legend>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-3">
              {CLIENTS.map((client) => <label key={client} className="inline-flex min-h-11 items-center gap-2 text-sm text-neutral-700">
                <input type="checkbox" checked={fields.supported_clients.includes(client)}
                  onChange={(event) => setFields((current) => ({ ...current,
                    supported_clients: event.target.checked
                      ? [...current.supported_clients, client]
                      : current.supported_clients.filter((value) => value !== client),
                  }))} />{client}
              </label>)}
            </div>
          </fieldset>
          <p className="text-xs text-neutral-500">Use public HTTPS links only. Never paste an API key, token, or private endpoint.</p>
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          {notice && <p role="status" className="text-sm text-green-700">{notice}</p>}
          <button type="submit" disabled={saving} className="min-h-11 rounded-xl bg-[#167ac6] px-5 text-sm font-semibold text-white disabled:opacity-50">
            {saving ? "Saving…" : "Save agent integrations"}
          </button>
        </form>
      )}
    </section>
  );
}
