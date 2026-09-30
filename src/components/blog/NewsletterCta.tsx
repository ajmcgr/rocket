import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

const NewsletterCta = () => {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<"success" | "error" | null>(null);
  const { toast } = useToast();

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email.trim()) return;
    setStatus(null);
    setLoading(true);
    try {
      const { error } = await supabase.functions.invoke("beehiiv-subscribe", {
        body: { email: email.trim() },
      });
      if (error) throw error;
      setStatus("success");
      toast({ title: "You're subscribed", description: "Thanks for joining the Rocket newsletter." });
      setEmail("");
    } catch {
      setStatus("error");
      toast({ title: "Something went wrong", description: "Please try again later.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <section aria-labelledby="newsletter-heading" className="border-t border-neutral-200 bg-white px-5 py-14 dark:border-neutral-800 dark:bg-neutral-950 sm:px-8 sm:py-20">
      <div className="mx-auto max-w-3xl text-center">
        <h2 id="newsletter-heading" className="text-3xl font-bold tracking-tight text-neutral-950 dark:text-white sm:text-4xl">
          Get the newsletter
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-neutral-600 dark:text-neutral-300 sm:text-lg">
          Subscribe for free. Weekly updates on launches, no filler.
        </p>
        <form onSubmit={submit} className="mx-auto mt-8 flex w-full max-w-xl flex-col gap-3 sm:flex-row">
          <Input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="Enter your email"
            aria-label="Email address"
            className="h-12 min-w-0 flex-1 border-neutral-300 bg-white text-neutral-900 placeholder:text-neutral-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white dark:placeholder:text-neutral-400 sm:h-13"
          />
          <Button type="submit" size="lg" className="h-12 shrink-0 bg-[#167ac6] text-white hover:bg-[#1268aa] sm:h-13" disabled={loading}>
            {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Subscribing…</> : "Subscribe"}
          </Button>
        </form>
        {status === "success" && <p role="status" className="mt-3 text-sm text-emerald-700">Thanks for subscribing. Please check your inbox.</p>}
        {status === "error" && <p role="alert" className="mt-3 text-sm text-red-600">We couldn't subscribe you right now. Please try again.</p>}
        <p className="mt-3 text-xs text-neutral-500 dark:text-neutral-400">Unsubscribe anytime.</p>
      </div>
    </section>
  );
};

export default NewsletterCta;
