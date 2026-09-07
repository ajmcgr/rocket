-- Stripe can deliver valid webhook events out of order. Keep an immutable event
-- ledger and only let newer subscription events change entitlements.

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS stripe_price_id text,
  ADD COLUMN IF NOT EXISTS stripe_event_created_at timestamptz;

CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
  event_id text PRIMARY KEY,
  event_type text NOT NULL,
  event_created_at timestamptz NOT NULL,
  subscription_id text,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  processing_result text NOT NULL CHECK (processing_result IN ('applied', 'stale')),
  processed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS stripe_webhook_events_subscription_idx
  ON public.stripe_webhook_events(subscription_id);

ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.stripe_webhook_events FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.stripe_webhook_events TO service_role;

CREATE OR REPLACE FUNCTION public.apply_stripe_subscription_event(
  p_event_id text,
  p_event_type text,
  p_user_id uuid,
  p_customer_id text,
  p_subscription_id text,
  p_price_id text,
  p_plan text,
  p_status text,
  p_current_period_start timestamptz,
  p_current_period_end timestamptz,
  p_trial_end timestamptz,
  p_cancel_at_period_end boolean,
  p_event_created_at timestamptz,
  p_monthly_limit integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected_rows integer;
BEGIN
  -- Claim the Stripe event first. A replay is a no-op, including concurrent
  -- delivery attempts for the same event.
  INSERT INTO public.stripe_webhook_events (
    event_id, event_type, event_created_at, subscription_id, user_id, processing_result
  ) VALUES (
    p_event_id, p_event_type, p_event_created_at, p_subscription_id, p_user_id, 'stale'
  ) ON CONFLICT (event_id) DO NOTHING;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  INSERT INTO public.subscriptions (
    user_id, stripe_customer_id, stripe_subscription_id, stripe_price_id,
    plan, status, current_period_start, current_period_end, trial_end,
    cancel_at_period_end, stripe_event_created_at, updated_at
  ) VALUES (
    p_user_id, p_customer_id, p_subscription_id, p_price_id,
    p_plan, p_status, p_current_period_start, p_current_period_end, p_trial_end,
    p_cancel_at_period_end, p_event_created_at, now()
  ) ON CONFLICT (user_id) DO UPDATE SET
    stripe_customer_id = EXCLUDED.stripe_customer_id,
    stripe_subscription_id = EXCLUDED.stripe_subscription_id,
    stripe_price_id = EXCLUDED.stripe_price_id,
    plan = EXCLUDED.plan,
    status = EXCLUDED.status,
    current_period_start = EXCLUDED.current_period_start,
    current_period_end = EXCLUDED.current_period_end,
    trial_end = EXCLUDED.trial_end,
    cancel_at_period_end = EXCLUDED.cancel_at_period_end,
    stripe_event_created_at = EXCLUDED.stripe_event_created_at,
    updated_at = now()
  WHERE public.subscriptions.stripe_event_created_at IS NULL
    OR EXCLUDED.stripe_event_created_at >= public.subscriptions.stripe_event_created_at;

  GET DIAGNOSTICS affected_rows = ROW_COUNT;

  IF affected_rows > 0 THEN
    UPDATE public.user_usage
    SET plan = p_plan, monthly_limit = p_monthly_limit
    WHERE user_id = p_user_id;

    UPDATE public.stripe_webhook_events
    SET processing_result = 'applied'
    WHERE event_id = p_event_id;
  END IF;

  RETURN affected_rows > 0;
END;
$$;

-- A delayed Checkout completion must never overwrite a newer subscription
-- lifecycle event. It can create the initial record, but cannot mutate one that
-- has already been ordered by Stripe's subscription webhooks.
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
      status = EXCLUDED.status
    WHERE public.subscriptions.stripe_event_created_at IS NULL;

    -- Do not change usage if a newer subscription webhook has already set it.
    IF FOUND THEN
      UPDATE public.user_usage
      SET plan = p_plan, monthly_limit = p_monthly_limit
      WHERE user_id = p_user_id;
    END IF;
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_stripe_subscription_event(
  text, text, uuid, text, text, text, text, text, timestamptz, timestamptz,
  timestamptz, boolean, timestamptz, integer
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_stripe_subscription_event(
  text, text, uuid, text, text, text, text, text, timestamptz, timestamptz,
  timestamptz, boolean, timestamptz, integer
) TO service_role;
