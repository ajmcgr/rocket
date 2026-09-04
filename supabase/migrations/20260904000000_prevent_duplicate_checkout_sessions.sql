-- Serialize checkout attempts per user/product and provide Stripe idempotency keys.

CREATE TABLE IF NOT EXISTS public.stripe_checkout_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product text NOT NULL,
  idempotency_key text NOT NULL UNIQUE,
  stripe_session_id text,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '30 minutes',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS stripe_checkout_attempts_active_idx
  ON public.stripe_checkout_attempts (user_id, product, expires_at DESC);

CREATE OR REPLACE FUNCTION public.get_active_stripe_checkout_attempt(
  p_user_id uuid,
  p_product text
)
RETURNS TABLE (id uuid, idempotency_key text, stripe_session_id text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing_attempt public.stripe_checkout_attempts%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_user_id::text || ':' || p_product));

  SELECT * INTO existing_attempt
  FROM public.stripe_checkout_attempts
  WHERE user_id = p_user_id
    AND product = p_product
    AND expires_at > now()
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN QUERY SELECT existing_attempt.id, existing_attempt.idempotency_key, existing_attempt.stripe_session_id;
    RETURN;
  END IF;

  INSERT INTO public.stripe_checkout_attempts (user_id, product, idempotency_key)
  VALUES (p_user_id, p_product, 'rocket-checkout-' || gen_random_uuid()::text)
  RETURNING * INTO existing_attempt;

  RETURN QUERY SELECT existing_attempt.id, existing_attempt.idempotency_key, existing_attempt.stripe_session_id;
END;
$$;

REVOKE ALL ON TABLE public.stripe_checkout_attempts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_active_stripe_checkout_attempt(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.stripe_checkout_attempts TO service_role;
GRANT EXECUTE ON FUNCTION public.get_active_stripe_checkout_attempt(uuid, text) TO service_role;
