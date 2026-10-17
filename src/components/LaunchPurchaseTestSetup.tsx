import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type Setup = {
  configured: boolean;
  tester_handle?: string | null;
  verified?: boolean;
  test_url: string;
};
const messages: Record<string, string> = {
  independent_confirmed_tester_required:
    "Choose another person with a confirmed Rocket account. You cannot test your own plan.",
  tester_handle_required: "Enter the tester’s Rocket username.",
  new_buyer_required:
    "Choose a tester who has not bought Launch through Rocket before.",
  tester_already_configured:
    "A tester is already selected. Refresh the test status.",
  acceptance_not_ready:
    "The test checkout is not ready. Check your connected Stripe account and Launch Pro price, then try again.",
};
export default function LaunchPurchaseTestSetup({
  planId,
  onVerified,
}: {
  planId: string;
  onVerified: () => void;
}) {
  const [setup, setSetup] = useState<Setup | null>(null);
  const [handle, setHandle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const request = useCallback(
    async (action: string, details: Record<string, string> = {}) => {
      const result = await supabase.functions.invoke(
        "launch-rocket-acceptance",
        { body: { action, plan_id: planId, ...details } },
      );
      let failure = result.data?.error;
      if (result.error?.context instanceof Response)
        failure =
          (
            await result.error.context
              .clone()
              .json()
              .catch(() => null)
          )?.error || failure;
      if (result.error || failure)
        throw new Error(
          messages[failure] ||
            "Could not load the purchase test. Please try again.",
        );
      return result.data as Setup;
    },
    [planId],
  );
  const refresh = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const next = await request("setup");
      setSetup(next);
      if (next.verified) onVerified();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }, [request, onVerified]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  const configure = async () => {
    setBusy(true);
    setError("");
    try {
      setSetup(await request("configure", { tester_handle: handle }));
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mt-3 space-y-3 rounded-xl border border-neutral-200 p-4">
      <h4 className="font-semibold">Recommended: test Launch Pro</h4>
      <p className="text-sm">
        This optional test is a real $39 USD one-time purchase, not Stripe test
        mode. The plan stays unpublished and only your selected tester can check
        out.
      </p>
      <ol className="list-decimal space-y-1 pl-5 text-sm">
        <li>Select an independent tester with a confirmed Rocket account.</li>
        <li>
          Have them sign into Launch with Continue with Rocket and create an
          unpaid app draft.
        </li>
        <li>
          Share the private test link. They sign into Rocket with the same
          account and complete the $39 checkout.
        </li>
        <li>
          In Launch’s My Products, apply the purchase to their draft. Return
          here and check verification.
        </li>
      </ol>
      {setup && !setup.configured && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-sm">
            Tester’s Rocket username
            <input
              value={handle}
              onChange={(event) => setHandle(event.target.value)}
              placeholder="@username"
              className="mt-1 block h-10 rounded-lg border border-neutral-200 bg-background px-3"
            />
          </label>
          <button
            type="button"
            disabled={busy || !handle.trim()}
            onClick={() => void configure()}
            className="rounded-lg border border-brand px-4 py-2 text-sm font-semibold disabled:opacity-50"
          >
            Set up test purchase
          </button>
        </div>
      )}
      {setup?.configured && (
        <div className="space-y-2 text-sm">
          <p>
            Selected tester:{" "}
            {setup.tester_handle
              ? `@${setup.tester_handle}`
              : "your configured tester"}
          </p>
          <p>Share this private link with your tester:</p>
          <a
            href={setup.test_url}
            target="_blank"
            rel="noopener noreferrer"
            className="block break-all text-brand underline"
          >
            {setup.test_url}
          </a>
          <p>
            Opening the link does not charge anything. The tester confirms
            payment at checkout.
          </p>
        </div>
      )}
      <button
        type="button"
        disabled={busy}
        onClick={() => void refresh()}
        className="text-sm font-semibold text-brand underline"
      >
        {busy ? "Checking…" : "Check purchase verification"}
      </button>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
