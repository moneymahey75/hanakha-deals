/*
  Launch plans are stored as upgrade plans because existing pre-launch users
  buy them as upgrades. After launch, new users buy the same Launch plans
  during registration, so registration payment must accept active Launch
  upgrade plans too.
*/

CREATE OR REPLACE FUNCTION public.create_registration_payment(
  p_user_id uuid,
  p_plan_id uuid,
  p_amount numeric,
  p_currency text DEFAULT 'USDT',
  p_payment_method text DEFAULT 'blockchain',
  p_payment_status text DEFAULT 'completed',
  p_transaction_id text DEFAULT NULL,
  p_gateway_response jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $create_registration_payment$
DECLARE
  v_plan_price numeric;
  v_duration_days integer;
  v_plan_type text;
  v_plan_phase text;
  v_subscription_id uuid;
  v_payment_id uuid;
  v_is_service_role boolean;
  v_start_date timestamptz;
  v_end_date timestamptz;
BEGIN
  v_is_service_role := (current_setting('request.jwt.claims', true)::json ->> 'role') = 'service_role';

  IF NOT v_is_service_role AND auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT v_is_service_role AND auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'User mismatch';
  END IF;

  SELECT tsp_price, tsp_duration_days, tsp_type, COALESCE(tsp_plan_phase, 'prelaunch')
    INTO v_plan_price, v_duration_days, v_plan_type, v_plan_phase
  FROM public.tbl_subscription_plans
  WHERE tsp_id = p_plan_id
    AND tsp_is_active = true
  LIMIT 1;

  IF v_plan_price IS NULL THEN
    RAISE EXCEPTION 'Subscription plan not found';
  END IF;

  IF NOT (
    lower(coalesce(v_plan_type, '')) = 'registration'
    OR (v_plan_phase = 'launch' AND lower(coalesce(v_plan_type, '')) = 'upgrade')
  ) THEN
    RAISE EXCEPTION 'Only registration plans, or Launch plans, can be used for registration payment';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    p_amount := v_plan_price;
  END IF;

  IF round(p_amount, 6) <> round(v_plan_price, 6) THEN
    RAISE EXCEPTION 'Amount mismatch';
  END IF;

  IF p_transaction_id IS NOT NULL THEN
    SELECT tp_id, tp_subscription_id
      INTO v_payment_id, v_subscription_id
    FROM public.tbl_payments
    WHERE tp_transaction_id = p_transaction_id
    LIMIT 1;

    IF v_payment_id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'success', true,
        'payment_id', v_payment_id,
        'subscription_id', v_subscription_id,
        'plan_phase', v_plan_phase,
        'deduped', true
      );
    END IF;
  END IF;

  SELECT tus_id
    INTO v_subscription_id
  FROM public.tbl_user_subscriptions
  WHERE tus_user_id = p_user_id
    AND tus_plan_id = p_plan_id
    AND tus_status = 'active'
  LIMIT 1;

  v_start_date := now();
  v_end_date := v_start_date + (COALESCE(v_duration_days, 30) || ' days')::interval;

  IF v_plan_phase = 'launch' THEN
    PERFORM public.activate_user_plan_phase(p_user_id, 'launch');
  END IF;

  IF v_subscription_id IS NULL THEN
    INSERT INTO public.tbl_user_subscriptions (
      tus_user_id,
      tus_plan_id,
      tus_status,
      tus_start_date,
      tus_end_date,
      tus_payment_amount,
      tus_plan_phase
    ) VALUES (
      p_user_id,
      p_plan_id,
      'active',
      v_start_date,
      v_end_date,
      p_amount,
      v_plan_phase
    )
    RETURNING tus_id INTO v_subscription_id;
  END IF;

  INSERT INTO public.tbl_payments (
    tp_user_id,
    tp_subscription_id,
    tp_amount,
    tp_currency,
    tp_payment_method,
    tp_payment_status,
    tp_transaction_id,
    tp_gateway_response
  ) VALUES (
    p_user_id,
    v_subscription_id,
    p_amount,
    COALESCE(p_currency, 'USDT'),
    COALESCE(p_payment_method, 'blockchain'),
    COALESCE(p_payment_status, 'completed'),
    p_transaction_id,
    jsonb_build_object('plan_phase', v_plan_phase) || COALESCE(p_gateway_response, '{}'::jsonb)
  )
  RETURNING tp_id INTO v_payment_id;

  IF COALESCE(p_payment_status, 'completed') = 'completed' THEN
    UPDATE public.tbl_users
    SET tu_registration_paid = true,
        tu_registration_paid_at = now(),
        tu_current_plan_phase = CASE WHEN v_plan_phase = 'launch' THEN 'launch' ELSE tu_current_plan_phase END,
        tu_launch_plan_activated_at = CASE
          WHEN v_plan_phase = 'launch' THEN COALESCE(tu_launch_plan_activated_at, now())
          ELSE tu_launch_plan_activated_at
        END
    WHERE tu_id = p_user_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'payment_id', v_payment_id,
    'subscription_id', v_subscription_id,
    'plan_phase', v_plan_phase,
    'deduped', false
  );
EXCEPTION
  WHEN unique_violation THEN
    IF p_transaction_id IS NOT NULL THEN
      SELECT tp_id, tp_subscription_id
        INTO v_payment_id, v_subscription_id
      FROM public.tbl_payments
      WHERE tp_transaction_id = p_transaction_id
      LIMIT 1;

      IF v_payment_id IS NOT NULL THEN
        RETURN jsonb_build_object(
          'success', true,
          'payment_id', v_payment_id,
          'subscription_id', v_subscription_id,
          'plan_phase', v_plan_phase,
          'deduped', true
        );
      END IF;
    END IF;
    RAISE;
END;
$create_registration_payment$;

GRANT EXECUTE ON FUNCTION public.create_registration_payment(
  uuid,
  uuid,
  numeric,
  text,
  text,
  text,
  text,
  jsonb
) TO authenticated;
