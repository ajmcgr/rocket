-- Atomic entitlement and credit mutations used only by trusted Edge Functions.

CREATE TABLE IF NOT EXISTS public.stripe_checkout_fulfillments (
  stripe_session_id text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.apply_stripe_checkout_completion(
  p_user_id uuid,
  p_session_id text,
  p_amount integer,
  p_currency text,
  p_payment_type text,
  p_credits integer,
  p_payment_intent_id text,
  p_customer_id text DEFAULT NULL,
  p_subscription_id text DEFAULT NULL,
  p_plan text DEFAULT NULL,
  p_monthly_limit integer DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.stripe_checkout_fulfillments (stripe_session_id)
  VALUES (p_session_id)
  ON CONFLICT DO NOTHING;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  INSERT INTO public.payments (
    user_id, amount, currency, payment_type, credits_added,
    stripe_session_id, stripe_payment_intent_id, status
  ) VALUES (
    p_user_id, p_amount, p_currency, p_payment_type, p_credits,
    p_session_id, p_payment_intent_id, 'succeeded'
  );

  IF p_credits > 0 THEN
    UPDATE public.user_usage
    SET credits_extra = credits_extra + p_credits
    WHERE user_id = p_user_id;

    INSERT INTO public.credit_transactions (user_id, kind, credits, meta)
    VALUES (p_user_id, 'purchased', p_credits, jsonb_build_object('stripe_session_id', p_session_id));
  END IF;

  IF p_plan IS NOT NULL AND p_monthly_limit IS NOT NULL THEN
    INSERT INTO public.subscriptions (
      user_id, stripe_customer_id, stripe_subscription_id, plan, status
    ) VALUES (
      p_user_id, p_customer_id, p_subscription_id, p_plan, 'trialing'
    ) ON CONFLICT (user_id) DO UPDATE SET
      stripe_customer_id = COALESCE(EXCLUDED.stripe_customer_id, public.subscriptions.stripe_customer_id),
      stripe_subscription_id = COALESCE(EXCLUDED.stripe_subscription_id, public.subscriptions.stripe_subscription_id),
      plan = EXCLUDED.plan,
      status = EXCLUDED.status;

    UPDATE public.user_usage
    SET plan = p_plan, monthly_limit = p_monthly_limit
    WHERE user_id = p_user_id;
  END IF;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.reserve_generation_credits(
  p_user_id uuid,
  p_credits integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_credits <= 0 THEN
    RETURN true;
  END IF;

  UPDATE public.user_usage
  SET credits_used = credits_used + p_credits
  WHERE user_id = p_user_id
    AND monthly_limit + credits_extra - credits_used >= p_credits;

  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_generation_credits(
  p_user_id uuid,
  p_credits integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_credits > 0 THEN
    UPDATE public.user_usage
    SET credits_used = GREATEST(0, credits_used - p_credits)
    WHERE user_id = p_user_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_stripe_checkout_completion(uuid, text, integer, text, text, integer, text, text, text, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reserve_generation_credits(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_generation_credits(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_stripe_checkout_completion(uuid, text, integer, text, text, integer, text, text, text, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.reserve_generation_credits(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_generation_credits(uuid, integer) TO service_role;
