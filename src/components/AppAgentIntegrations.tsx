import { useState } from "react";

export type PublicAgentIntegrations = {
  mcp_url: string | null;
  api_docs_url: string | null;
  github_url: string | null;
  deployment_url: string | null;
  supported_clients: string[];
};

const safeHttps = (value: string | null) => {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port ||
      url.search || url.hash || !url.hostname.includes(".") ||
      /(^localhost$|\.(localhost|local|internal|test|invalid|example|onion)$)/i.test(url.hostname) ||
      /^\[?[0-9a-f:.]+\]?$/i.test(url.hostname)) return null;
    return url.toString();
  } catch { return null; }
};

export default function AppAgentIntegrations({ integration, linkedGithubUrl }: {
  integration: PublicAgentIntegrations | null;
  linkedGithubUrl?: string | null;
}) {
  const [showMcp, setShowMcp] = useState(false);
  const [copied, setCopied] = useState(false);
  if (!integration) return null;
  const clients = Array.isArray(integration.supported_clients) ? integration.supported_clients : [];
  const mcp = safeHttps(integration.mcp_url);
  const links = [
    ["View API", safeHttps(integration.api_docs_url)],
    ["View Source", safeHttps(integration.github_url || linkedGithubUrl || null)],
    ["Deployment Guide", safeHttps(integration.deployment_url)],
  ] as const;
  if (!mcp && !links.some(([, url]) => url) && !clients.length) return null;
  return (
    <section aria-labelledby="agent-integration-heading" className="mt-8 rounded-3xl border border-neutral-200 bg-white p-5 sm:p-7">
      <h2 id="agent-integration-heading" className="text-xl font-semibold tracking-tight">Works with AI Agents</h2>
      <p className="mt-2 text-sm text-neutral-600">These integrations and client compatibilities are declared by the app developer. Rocket has not verified them.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {mcp && <button type="button" onClick={() => setShowMcp((open) => !open)}
          aria-expanded={showMcp} className="inline-flex min-h-11 items-center rounded-xl border border-sky-200 bg-sky-50 px-4 text-sm font-semibold text-sky-800 hover:bg-sky-100">Connect MCP</button>}
        {links.filter(([, url]) => Boolean(url)).map(([label, url]) => <a key={label} href={url!} target="_blank" rel="noopener noreferrer nofollow"
          className="inline-flex min-h-11 items-center rounded-xl border border-neutral-200 px-4 text-sm font-semibold text-sky-800 hover:border-sky-300">{label}</a>)}
      </div>
      {mcp && showMcp && <div className="mt-4 rounded-xl bg-neutral-50 p-4 text-sm">
        <p className="font-medium text-neutral-800">Add this server URL in your AI client:</p>
        <code className="mt-2 block break-all text-neutral-700">{mcp}</code>
        <button type="button" className="mt-3 min-h-11 rounded-lg bg-[#167ac6] px-4 font-semibold text-white"
          onClick={async () => { try { await navigator.clipboard.writeText(mcp); setCopied(true); } catch { setCopied(false); } }}>
          {copied ? "Copied" : "Copy MCP URL"}
        </button>
      </div>}
      {clients.length > 0 && <div className="mt-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Developer-declared clients</p>
        <div className="mt-2 flex flex-wrap gap-2">{clients.map((client) => <span key={client} className="rounded-full bg-neutral-100 px-3 py-1.5 text-xs font-medium text-neutral-700">{client}</span>)}</div>
      </div>}
    </section>
  );
}
