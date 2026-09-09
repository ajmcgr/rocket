import { Link } from "react-router-dom";
import { Zap, Loader2, ArrowRight, X } from "lucide-react";
import { useState } from "react";
import { supabase as _sb } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { track } from "@/lib/analytics";
const supabase = _sb as any;

type Props = {
  open: boolean;
  onClose: () => void;
  needed?: number;
  remaining?: number;
};

const PACKS = [
  { id: "pack_500", label: "500 credits", price: "$5" },
  { id: "pack_1500", label: "1,500 credits", price: "$10", highlight: true },
  { id: "pack_5000", label: "5,000 credits", price: "$25" },
];

export default function OutOfCreditsModal({ open, onClose, needed, remaining }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState<string | null>(null);

  if (!open) return null;

  const checkout = async (product: string) => {
    setLoading(product);
    try {
      track("checkout_started", { product, source: "out_of_credits" });
      const { data, error } = await supabase.functions.invoke("stripe-checkout", { body: { product } });
      if (error) throw error;
      if ((data as any)?.url) window.location.href = (data as any).url;
    } catch (e: any) {
      toast({ title: "Checkout failed", description: e.message, variant: "destructive" });
      setLoading(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-6 shadow-2xl"
      >
        <button onClick={onClose} aria-label="Close" className="absolute right-3 top-3 rounded-full p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700">
          <X className="h-4 w-4" />
        </button>
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand/10">
          <Zap className="h-5 w-5 text-brand" />
        </div>
        <h2 className="mt-4 text-lg font-semibold tracking-tight">You're out of credits</h2>
        <p className="mt-1 text-sm text-neutral-600">
          {typeof needed === "number" && typeof remaining === "number"
            ? `This generation needs ${needed} credits — you have ${remaining}.`
            : "Top up or upgrade to keep generating."}
        </p>

        <div className="mt-5 space-y-2">
          {PACKS.map((p) => (
            <button
              key={p.id}
              onClick={() => checkout(p.id)}
              disabled={!!loading}
              className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-sm transition ${
                p.highlight
                  ? "border-brand bg-brand/5 text-brand hover:bg-brand/10"
                  : "border-neutral-200 bg-white text-neutral-800 hover:border-neutral-300"
              }`}
            >
              <span className="inline-flex items-center gap-2 font-medium">
                {loading === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                {p.label}
              </span>
              <span className={p.highlight ? "font-semibold text-brand" : "text-neutral-500"}>{p.price}</span>
            </button>
          ))}
        </div>

        <button
          onClick={() => checkout("growth")}
          disabled={!!loading}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-neutral-900 px-4 py-3 text-sm font-semibold text-white hover:bg-neutral-800"
        >
          {loading === "growth" ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Upgrade to Pro — $20/mo · 3,000 credits <ArrowRight className="h-4 w-4" /></>}
        </button>

        <Link to="/pricing" target="_blank" rel="noreferrer" onClick={onClose} className="mt-3 block text-center text-xs text-neutral-500 hover:text-neutral-700">
          See full pricing →
        </Link>
      </div>
    </div>
  );
}
