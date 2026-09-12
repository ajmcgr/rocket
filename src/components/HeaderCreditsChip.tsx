import { Link } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { Zap } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase as _sb } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { track } from "@/lib/analytics";
import OutOfCreditsModal from "./OutOfCreditsModal";
const supabase = _sb as any;

// Compact credits meter shown in the header next to the avatar.
// Reactive: refetches whenever anyone dispatches `credits:refresh` on window.
export default function HeaderCreditsChip() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [credits, setCredits] = useState<number | null>(null);
  const [buyOpen, setBuyOpen] = useState(false);
  const warnedRef = useRef(false);

  const openTopUp = (source: "low_credit_toast" | "low_credit_header") => {
    track("credit_topup_interacted", { source, remaining: credits });
    setBuyOpen(true);
  };

  useEffect(() => {
    if (!user) { setCredits(null); return; }
    let alive = true;
    const load = async () => {
      const { data } = await supabase.from("user_usage").select("monthly_limit, credits_extra, credits_used").eq("user_id", user.id).maybeSingle();
      if (!alive || !data) return;
      const remaining = (data.monthly_limit || 0) + (data.credits_extra || 0) - (data.credits_used || 0);
      setCredits(remaining);
      // Fire a one-time warning per session when the balance dips under 20.
      if (!warnedRef.current && remaining > 0 && remaining < 20) {
        warnedRef.current = true;
        track("credit_topup_eligible", { remaining });
        track("credit_topup_surface", { source: "low_credit_toast", remaining });
        toast({
          title: "Running low on credits",
          description: `${remaining} left — top up to keep generating without interruption.`,
          action: (
            <ToastAction altText="Top up credits" onClick={() => {
              track("credit_topup_interacted", { source: "low_credit_toast", remaining });
              setBuyOpen(true);
            }}>
              Top up
            </ToastAction>
          ),
        });
      }
    };
    load();
    const onRefresh = () => load();
    window.addEventListener("credits:refresh", onRefresh);
    return () => { alive = false; window.removeEventListener("credits:refresh", onRefresh); };
  }, [user, toast]);

  if (!user || credits === null) return null;
  const low = credits < 20;
  return (
    <>
      {low ? (
        <button
          type="button"
          onClick={() => openTopUp("low_credit_header")}
          title={`${credits} credits remaining — click to top up`}
          className="hidden items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 transition hover:bg-amber-100 sm:inline-flex"
        >
          <Zap className="h-3 w-3 text-amber-500" />
          {credits.toLocaleString()}
        </button>
      ) : (
        <Link
          to="/pricing"
          title={`${credits} credits remaining`}
          className="hidden items-center gap-1 rounded-full border border-neutral-200 bg-white px-2.5 py-1 text-xs font-medium text-neutral-700 transition hover:bg-neutral-50 sm:inline-flex"
        >
          <Zap className="h-3 w-3 text-brand" />
          {credits.toLocaleString()}
        </Link>
      )}
      <OutOfCreditsModal open={buyOpen} onClose={() => setBuyOpen(false)} remaining={credits} source="low_credit" />
    </>
  );
}
