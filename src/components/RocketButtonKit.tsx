import { useState } from "react";
import RocketButton from "./RocketButton";

const snippet = `<script defer src="https://tryrocket.ai/buttons/v1/rocket-buttons.js"></script>
<rocket-button action="continue" variant="primary" id="rocket-sign-in"></rocket-button>
<rocket-button action="buy" variant="primary" id="rocket-buy"></rocket-button>
<script>
  // Attach your existing authorization/checkout handlers; the kit sends no requests.
  document.getElementById("rocket-sign-in").addEventListener("rocket-activate", startExistingRocketSignIn);
  document.getElementById("rocket-buy").addEventListener("rocket-activate", startExistingRocketPurchase);
</script>`;
export default function RocketButtonKit() {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  return (
    <section
      id="rocket-buttons"
      className="rounded-2xl border border-neutral-200 bg-white p-6 text-neutral-900"
    >
      <h2 className="text-xl font-semibold">Official Rocket Buttons</h2>
      <p className="mt-2 text-sm text-neutral-600">
        One component for Rocket and your app. Fixed wording and Rocket mark.
        These previews do not start sign-in or checkout.
      </p>
      <div className="mt-5 flex flex-wrap gap-5">
        {(["primary", "dark", "light"] as const).map((variant) => (
          <div key={variant} className="flex flex-col items-start gap-3">
            <p className="text-sm font-semibold capitalize">
              {variant === "primary" ? "Rocket blue" : variant}
            </p>
            <RocketButton action="continue" variant={variant} />
            <RocketButton action="buy" variant={variant} />
          </div>
        ))}
      </div>
      <div className="mt-5 flex flex-wrap gap-4">
        <div>
          <p className="mb-2 text-sm">Loading</p>
          <RocketButton action="buy" loading />
        </div>
        <div>
          <p className="mb-2 text-sm">Disabled</p>
          <RocketButton action="buy" disabled />
        </div>
      </div>
      <details className="mt-5">
        <summary className="cursor-pointer font-semibold">
          Use in your app
        </summary>
        <pre className="mt-3 overflow-x-auto rounded-xl bg-neutral-950 p-4 text-xs text-white">
          <code>{snippet}</code>
        </pre>
        <button
          type="button"
          className="mt-3 rounded-lg border px-4 py-2"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(snippet);
              setCopied(true);
              setCopyError(false);
            } catch {
              setCopyError(true);
            }
          }}
        >
          Copy button example
        </button>
        <p role="status" className="mt-2 text-sm">
          {copyError
            ? "Copy unavailable. Select the example above."
            : copied
              ? "Button example copied."
              : "Use your existing handlers and keep eligibility checks."}
        </p>
      </details>
      <p className="mt-4 text-sm">
        Allow only primary, dark or light. Keep the mark, labels, spacing and
        colors intact. Leave room around the 48px control; show price and
        renewal terms beside Buy with Rocket. Loading keeps the label and
        announces progress. Native keyboard controls, focus rings and
        reduced-motion support are built in.
      </p>
      <a
        className="mt-3 inline-block text-sm underline"
        href="/buttons/v1/brand-usage.html"
        target="_blank"
        rel="noopener noreferrer"
      >
        Brand usage and integration spec ↗
      </a>
    </section>
  );
}
