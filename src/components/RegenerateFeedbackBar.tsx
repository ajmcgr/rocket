import { useState } from "react";
import { Loader2, Sparkles, Wand2 } from "lucide-react";
import { supabase as _sb } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { handleAiError } from "@/lib/aiErrors";
const supabase = _sb as any;

type Props = {
  asset: any;
  onDone: () => void;
  onNoCredits: (info: { needed?: number; remaining?: number }) => void;
};

const QUICK: Record<string, string[]> = {
  logo: ["Bolder weight", "More minimal", "Different color", "Simplify the mark"],
  color_system: ["More vibrant", "More muted", "Darker mode", "Add an accent"],
  font_system: ["Pair with a serif", "Modern grotesque", "Editorial", "Techy mono accents"],
  brand_voice: ["Warmer tone", "More technical", "Tighter", "Playful edge"],
  brand_guidelines: ["Shorter, punchier", "Add do/don't examples", "More strategic"],
  launch_copy: ["Tighter hero", "More benefit-driven", "Add urgency", "Punchier CTAs"],
  product_hunt_copy: ["More casual", "Highlight AI angle", "Add social proof"],
  social_post: ["Punchier", "Add emoji", "Add a CTA line"],
  founder_bio: ["Third person", "Warmer", "More technical", "Shorter"],
  presentation: ["Fewer slides", "Deeper detail", "More visual"],
};

export default function RegenerateFeedbackBar({ asset, onDone, onNoCredits }: Props) {
  const { toast } = useToast();
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);

  const presets = QUICK[asset.asset_type] || ["Try a different direction", "Tighter", "Bolder"];

  const run = async (instruction: string) => {
    if (!instruction.trim()) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("regenerate-asset", {
        body: { asset_id: asset.id, instruction: instruction.trim() },
      });
      const err = handleAiError(data, error, toast);
      if (err?.kind === "no_credits") { onNoCredits({ needed: err.needed, remaining: err.remaining }); return; }
      if (err) return;
      window.dispatchEvent(new Event("credits:refresh"));
      toast({ title: "Regenerated", description: "Rocket applied your feedback. Previous version saved." });
      setFeedback("");
      onDone();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-neutral-200 bg-gradient-to-br from-brand/5 to-white p-4">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-neutral-800">
        <Sparkles className="h-3.5 w-3.5 text-brand" /> Regenerate with feedback
      </div>
      <p className="mb-3 text-[11px] text-neutral-500">
        Tell Rocket what to change. The previous version is saved automatically so you can restore it any time.
      </p>
      <div className="mb-2 flex flex-wrap gap-1.5">
        {presets.map((p) => (
          <button
            key={p}
            type="button"
            disabled={busy}
            onClick={() => run(p)}
            className="rounded-full border border-neutral-200 bg-white px-2.5 py-1 text-[11px] text-neutral-700 hover:border-brand hover:text-brand disabled:opacity-50"
          >
            {p}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") run(feedback); }}
          placeholder="e.g. Make the accent color mint, keep the wordmark…"
          disabled={busy}
          className="flex-1 rounded-full border border-neutral-200 bg-white px-3 py-2 text-sm outline-hidden focus:border-brand"
        />
        <button
          type="button"
          onClick={() => run(feedback)}
          disabled={busy || !feedback.trim()}
          className="inline-flex items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-sm font-medium text-brand-foreground hover:bg-brand-hover disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />} Regenerate
        </button>
      </div>
    </div>
  );
}