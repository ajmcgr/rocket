import { useState } from "react";
import { Link } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import SiteHeader from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";

const ForgotPassword = () => {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const { toast } = useToast();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.functions.invoke("request-password-reset", { body: { email } });
      if (error) throw error;
      setSent(true);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-white text-neutral-900">
      <SiteHeader />
      <main className="flex flex-1 items-center justify-center px-6 py-16">
        <div className="w-full max-w-md">
          <div className="rounded-2xl border border-neutral-200 bg-white p-8 shadow-xs">
            <h1 className="text-2xl font-semibold tracking-tight">Reset your password</h1>
            <p className="mt-1.5 text-sm text-neutral-500">
              Enter your email and we'll send you a reset link.
            </p>
            {sent ? (
              <div className="mt-6 rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-700">
                If an account exists for <strong>{email}</strong>, a reset link is on its way. It expires in 1 hour.
              </div>
            ) : (
              <form onSubmit={submit} className="mt-6 space-y-3">
                <input
                  type="email"
                  required
                  placeholder="you@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-11 w-full rounded-lg border border-neutral-200 bg-white px-3.5 text-sm outline-hidden ring-neutral-300 transition focus:ring-2"
                />
                <Button type="submit" disabled={loading} size="lg" className="w-full">
                  {loading ? "Sending…" : "Send reset link"}
                </Button>
              </form>
            )}
            <p className="mt-6 text-center text-sm text-neutral-500">
              <Link to="/login" className="font-medium text-neutral-900 hover:underline">Back to log in</Link>
            </p>
          </div>
        </div>
      </main>

    </div>
  );
};

export default ForgotPassword;
