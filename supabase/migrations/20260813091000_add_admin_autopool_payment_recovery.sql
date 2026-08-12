-- Use only after an administrator has verified the on-chain USDT transfer.
-- This repairs the case where blockchain payment succeeded but the database
-- transaction failed before creating the AutoPool subscription.

CREATE OR REPLACE FUNCTION public.admin_recover_autopool_20_payment(
  p_user_id uuid,
  p_transaction_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan_id uuid;
  v_amount numeric;
  v_subscription_id uuid;
  v_payment_id uuid;
BEGIN
  IF p_user_id IS NULL OR NULLIF(btrim(p_transaction_id), '') IS NULL THEN
    RAISE EXCEPTION 'User ID and transaction hash are required';
  END IF;

  SELECT tsp_id, tsp_price
  INTO v_plan_id, v_amount
  FROM public.tbl_subscription_plans
  WHERE tsp_product_code = 'autopool_20' AND tsp_is_active = true
  LIMIT 1;

  IF v_plan_id IS NULL THEN
    RAISE EXCEPTION 'Active AutoPool Matrix plan not found';
  END IF;

  SELECT tp_id, tp_subscription_id
  INTO v_payment_id, v_subscription_id
  FROM public.tbl_payments
  WHERE tp_transaction_id = btrim(p_transaction_id)
  LIMIT 1;

  IF v_payment_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'deduped', true, 'payment_id', v_payment_id, 'subscription_id', v_subscription_id);
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.tbl_user_subscriptions us
    JOIN public.tbl_subscription_plans sp ON sp.tsp_id = us.tus_plan_id
    WHERE us.tus_user_id = p_user_id
      AND sp.tsp_product_code = 'autopool_20'
      AND us.tus_status IN ('active', 'upgraded')
      AND (us.tus_end_date IS NULL OR us.tus_end_date > now())
  ) THEN
    RAISE EXCEPTION 'User already has an active AutoPool Matrix subscription';
  END IF;

  INSERT INTO public.tbl_user_subscriptions (
    tus_user_id, tus_plan_id, tus_status, tus_start_date, tus_end_date,
    tus_payment_amount, tus_plan_phase, tus_package_kind
  ) VALUES (
    p_user_id, v_plan_id, 'active', now(), now() + interval '36500 days',
    v_amount, 'prelaunch', 'upgrade'
  ) RETURNING tus_id INTO v_subscription_id;

  INSERT INTO public.tbl_payments (
    tp_user_id, tp_subscription_id, tp_amount, tp_currency, tp_payment_method,
    tp_payment_status, tp_transaction_id, tp_gateway_response
  ) VALUES (
    p_user_id, v_subscription_id, v_amount, 'USDT', 'blockchain',
    'completed', btrim(p_transaction_id), jsonb_build_object('recovered_by_admin', true, 'recovered_at', now())
  ) RETURNING tp_id INTO v_payment_id;

  RETURN jsonb_build_object('success', true, 'deduped', false, 'payment_id', v_payment_id, 'subscription_id', v_subscription_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_recover_autopool_20_payment(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_recover_autopool_20_payment(uuid, text) TO service_role;

NOTIFY pgrst, 'reload schema';
