import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

const NewsletterCta = ({ compact = false }: { compact?: boolean }) => {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    try {
      const { error } = await supabase.functions.invoke("beehiiv-subscribe", {
        body: { email: email.trim() },
      });
      if (error) throw error;
      toast({ title: "You're in 🚀", description: "New branding playbooks land in your inbox weekly." });
      setEmail("");
    } catch {
      toast({ title: "Something went wrong", description: "Please try again later.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="rounded-3xl border border-neutral-200 bg-neutral-50 px-6 py-10 sm:px-10 sm:py-12">
      <div className="mx-auto max-w-2xl text-center">
        <h2
          className={compact ? "text-2xl font-medium tracking-tight text-neutral-900" : "text-3xl font-medium tracking-tight text-neutral-900 sm:text-4xl"}
          style={{ fontFamily: "Reckless, ui-serif, Georgia, serif" }}
        >
          Join thousands of founders learning how to build better brands.
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-neutral-600">
          One practical branding playbook a week — positioning, logos, typography, colour, and launch assets.
          Written for founders shipping on their own.
        </p>
        <form onSubmit={submit} className="mx-auto mt-7 flex w-full max-w-md flex-col gap-3 sm:flex-row">
          <Input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@company.com"
            aria-label="Email address"
            className="h-12 flex-1 border-neutral-200 bg-white text-neutral-900 placeholder:text-neutral-400"
          />
          <Button type="submit" size="lg" className="h-12 shrink-0" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Get the playbooks"}
          </Button>
        </form>
        <p className="mt-3 text-xs text-neutral-500">No spam. Unsubscribe anytime.</p>
      </div>
    </section>
  );
};

export default NewsletterCta;