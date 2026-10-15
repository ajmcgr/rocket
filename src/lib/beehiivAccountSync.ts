import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export const NEWSLETTER_SIGNUP_FLAG = "rocket_newsletter_signup_v1";
const OAUTH_SIGNUP_KEY = "rocket:newsletter-oauth-signup";
const NEW_ACCOUNT_WINDOW_MS = 10 * 60 * 1000;
let syncingUserId: string | null = null;

export function rememberOAuthSignup() {
  try { localStorage.setItem(OAUTH_SIGNUP_KEY, String(Date.now())); } catch { /* storage may be disabled */ }
}

export function forgetOAuthSignup() {
  try { localStorage.removeItem(OAUTH_SIGNUP_KEY); } catch { /* storage may be disabled */ }
}

// Called after auth state changes and after Rocket's email verification succeeds.
// The server still checks account ownership, verified email, and its own ledger.
export async function syncNewAccountToBeehiiv(user: User) {
  if (syncingUserId === user.id) return;
  syncingUserId = user.id;
  try {
    let requestedAt = 0;
    try { requestedAt = Number(localStorage.getItem(OAUTH_SIGNUP_KEY)); } catch { /* storage may be disabled */ }
    const age = Date.now() - Date.parse(user.created_at);
    const recentOAuthSignup = requestedAt > 0
      && Date.now() - requestedAt <= NEW_ACCOUNT_WINDOW_MS
      && age >= 0 && age <= NEW_ACCOUNT_WINDOW_MS;

    if (requestedAt && !recentOAuthSignup) forgetOAuthSignup();
    if (recentOAuthSignup && user.user_metadata?.[NEWSLETTER_SIGNUP_FLAG] !== true) {
      const { error } = await supabase.auth.updateUser({ data: { [NEWSLETTER_SIGNUP_FLAG]: true } });
      if (error) throw error;
      forgetOAuthSignup();
    }
    if (!recentOAuthSignup && user.user_metadata?.[NEWSLETTER_SIGNUP_FLAG] !== true) return;

    const { error } = await supabase.functions.invoke("beehiiv-account-sync", { body: {} });
    if (error) throw error;
  } catch (error) {
    // Never block sign-in or email verification; another auth event can retry.
    console.warn("Rocket newsletter sync will retry", error);
  } finally {
    syncingUserId = null;
  }
}
