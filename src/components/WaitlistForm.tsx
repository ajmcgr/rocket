import { Loader2 as ControlLoader2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Mail } from "@/components/EmojiIcons"; // v2
import { supabase } from "@/integrations/supabase/client";

const WaitlistForm = () => {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setLoading(true);
    try {
      const { error } = await supabase.functions.invoke('beehiiv-subscribe', {
        body: { email: email.trim(), name: name.trim() || undefined },
      });

      if (error) throw error;

      toast({
        title: "You're in! Welcome to Rocket 🚀",
        description: "Check your inbox for a confirmation.",
      });
      setEmail("");
      setName("");
    } catch {
      toast({
        title: "Something went wrong",
        description: "Please try again later.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mx-auto flex w-full max-w-md flex-col gap-3">
      <Input
        type="email"
        placeholder="your@email.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        className="h-12 border-cream/20 bg-background/40 font-body text-cream placeholder:text-cream/40 backdrop-blur-md transition-all duration-200 focus:border-cream/50 focus:bg-background/50 focus:ring-2 focus:ring-cream/15"
      />
      <Input
        type="text"
        placeholder="Full name (optional)"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="h-12 border-cream/20 bg-background/40 font-body text-cream placeholder:text-cream/40 backdrop-blur-md transition-all duration-200 focus:border-cream/50 focus:bg-background/50 focus:ring-2 focus:ring-cream/15"
      />
      <Button
        type="submit"
        disabled={loading}
        size="lg"
        className="h-12 bg-cream text-sm font-semibold tracking-wide text-background transition-all duration-200 hover:scale-[1.02] hover:bg-white hover:shadow-[0_0_20px_rgba(255,255,255,0.2)] active:scale-[0.98] disabled:opacity-60"
      >
        {loading ? (
          <>
            <ControlLoader2 className="h-4 w-4 animate-spin" />
            Joining...
          </>
        ) : (
          "Join the Waitlist"
        )}
      </Button>

      <p className="mt-3 text-center text-xs text-cream/40">
        <a
          href="mailto:?subject=You%20need%20to%20see%20this%20%F0%9F%8C%B4&body=Launch%20Island%20%E2%80%94%20the%20world's%20first%20AI%20vibe-coder%20island%20residency.%20Build%20and%20ship%20from%20paradise.%0A%0Ahttps%3A%2F%2Flaunchisland.org"
          className="text-cream/50 transition-colors hover:text-cream/80"
        >
          Share via email
        </a>
        {" · "}
        <a
          href="https://x.com/intent/tweet?text=Just%20discovered%20an%20AI%20vibe-coder%20island%20residency%20%F0%9F%8C%B4%0Ahttps%3A%2F%2Flaunchisland.org%0A%0Acc%20%40alexmacgregor__%20%40trylaunchai"
          target="_blank"
          rel="noopener noreferrer"
          className="text-cream/50 transition-colors hover:text-cream/80"
        >
          Post on X
        </a>
      </p>
    </form>
  );
};

export default WaitlistForm;
