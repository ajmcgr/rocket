import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Coins, Loader2, Zap } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase as _sb } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { CREDIT_PACKS } from "@/lib/credits";
import { track } from "@/lib/analytics";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const supabase = _sb as any;

type Props = { collapsed: boolean };

export default function BuyCreditsMenu({ collapsed }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    const load = async () => {
      const { data } = await supabase
        .from("user_usage")
        .select("monthly_limit, credits_extra, credits_used")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!alive || !data) return;
      const remaining =
        (data.monthly_limit || 0) +
        (data.credits_extra || 0) -
        (data.credits_used || 0);
      setBalance(remaining);
    };
    load();
    const onRefresh = () => load();
    window.addEventListener("credits:refresh", onRefresh);
    return () => {
      alive = false;
      window.removeEventListener("credits:refresh", onRefresh);
    };
  }, [user]);

  const checkout = async (product: string) => {
    setLoading(product);
    try {
      track("checkout_started", { product, source: "buy_credits_menu" });
      const { data, error } = await supabase.functions.invoke("stripe-checkout", {
        body: { product },
      });
      if (error) throw error;
      if (data?.url) {
        window.open(data.url, "_blank", "noopener,noreferrer");
      } else {
        toast({
          title: "Checkout unavailable",
          description: "No checkout URL returned.",
          variant: "destructive",
        });
      }
    } catch (e: any) {
      toast({
        title: "Checkout failed",
        description: e?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(null);
    }
  };

  if (!user) return null;

  const triggerClass = `group flex h-10 w-full items-center gap-3 rounded-xl text-sm font-semibold transition text-neutral-700 hover:bg-neutral-100 hover:text-neutral-950 ${collapsed ? "justify-center px-0" : "px-3"}`;

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={triggerClass}
          aria-label="Buy credits"
          title="Buy credits"
        >
          <Coins className="h-[18px] w-[18px] shrink-0" strokeWidth={1.9} />
          {!collapsed && <span className="truncate">Buy credits</span>}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        side="top"
        align="start"
        sideOffset={8}
        avoidCollisions
        className="w-60 rounded-xl border border-neutral-200 bg-white p-0 font-body shadow-xl"
      >
        <div className="border-b border-neutral-100 p-4">
          <p className="text-base font-semibold text-neutral-900">
            {balance === null ? "—" : balance.toLocaleString()} credits left
          </p>
          <p className="mt-0.5 text-xs text-neutral-500">
            One-time top-up, never expires
          </p>
        </div>

        <div className="p-1">
          {CREDIT_PACKS.map((pack) => (
            <DropdownMenuItem
              key={pack.id}
              onClick={() => checkout(pack.id)}
              disabled={loading === pack.id}
              className="flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm font-medium text-neutral-900 transition hover:bg-neutral-50 focus:bg-neutral-50"
            >
              <span className="flex items-center gap-2">
                {loading === pack.id ? (
                  <Loader2 className="h-4 w-4 animate-spin text-neutral-500" />
                ) : (
                  <Zap className="h-4 w-4 text-neutral-500" />
                )}
                {pack.credits.toLocaleString()} credits
              </span>
              <span className="text-sm font-semibold text-neutral-900">
                {pack.price}
              </span>
            </DropdownMenuItem>
          ))}
        </div>

        <div className="border-t border-neutral-100 p-1">
          <Link
            to="/pricing"
            onClick={() => setOpen(false)}
            className="flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium text-neutral-600 transition hover:bg-neutral-50 hover:text-neutral-900"
          >
            Or upgrade your plan
            <span>→</span>
          </Link>
          <a
            href="mailto:alex@tryrocket.ai"
            onClick={() => setOpen(false)}
            className="flex items-center rounded-lg px-3 py-2 text-sm font-medium text-neutral-600 transition hover:bg-neutral-50 hover:text-neutral-900"
          >
            Support
          </a>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
