import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import { Button } from "@/components/ui/button";

const ResetPassword = () => {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const nav = useNavigate();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      toast({ title: "Passwords don't match", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("reset-password", { body: { token, password } });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast({ title: "Password updated", description: "You can log in with your new password." });
      nav("/login", { replace: true });
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
            <h1 className="text-2xl font-semibold tracking-tight">Set a new password</h1>
            <p className="mt-1.5 text-sm text-neutral-500">Choose a strong password you'll remember.</p>
            {!token ? (
              <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                This reset link is invalid. <Link to="/forgot-password" className="font-medium underline">Request a new one</Link>.
              </div>
            ) : (
              <form onSubmit={submit} className="mt-6 space-y-3">
                <input
                  type="password"
                  required
                  minLength={6}
                  placeholder="New password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-11 w-full rounded-lg border border-neutral-200 bg-white px-3.5 text-sm outline-hidden ring-neutral-300 transition focus:ring-2"
                />
                <input
                  type="password"
                  required
                  minLength={6}
                  placeholder="Confirm new password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="h-11 w-full rounded-lg border border-neutral-200 bg-white px-3.5 text-sm outline-hidden ring-neutral-300 transition focus:ring-2"
                />
                <Button type="submit" disabled={loading} size="lg" className="w-full">
                  {loading ? "Updating…" : "Update password"}
                </Button>
              </form>
            )}
            <p className="mt-6 text-center text-sm text-neutral-500">
              <Link to="/login" className="font-medium text-neutral-900 hover:underline">Back to log in</Link>
            </p>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
};

export default ResetPassword;