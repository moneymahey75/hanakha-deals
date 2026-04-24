/*
  Create subscription payment using reserved wallet balance (working wallet).
  Intended for Phase-2 upgrades: reserved balance is not withdrawable.
*/

CREATE OR REPLACE FUNCTION create_subscription_payment_from_reserved(
  p_user_id uuid,
  p_plan_id uuid,
  p_currency text DEFAULT 'USDT',
  p_gateway_response jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_service_role boolean;
  v_plan_price numeric;
  v_duration_days integer;
  v_plan_type text;
  v_subscription_id uuid;
  v_payment_id uuid;
  v_start_date timestamptz;
  v_end_date timestamptz;
  v_wallet_id uuid;
  v_wallet_balance numeric;
  v_wallet_reserved numeric;
BEGIN
  v_is_service_role := (current_setting('request.jwt.claims', true)::json ->> 'role') = 'service_role';

  IF NOT v_is_service_role AND auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT v_is_service_role AND auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'User mismatch';
  END IF;

  SELECT tsp_price, tsp_duration_days, tsp_type
    INTO v_plan_price, v_duration_days, v_plan_type
  FROM tbl_subscription_plans
  WHERE tsp_id = p_plan_id
  LIMIT 1;

  IF v_plan_price IS NULL THEN
    RAISE EXCEPTION 'Subscription plan not found';
  END IF;

  IF lower(coalesce(v_plan_type, '')) <> 'upgrade' THEN
    RAISE EXCEPTION 'Only upgrade plans can be paid from reserved balance';
  END IF;

  SELECT tus_id
    INTO v_subscription_id
  FROM tbl_user_subscriptions
  WHERE tus_user_id = p_user_id
    AND tus_plan_id = p_plan_id
    AND tus_status = 'active'
  LIMIT 1;

  IF v_subscription_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'payment_id', null,
      'subscription_id', v_subscription_id,
      'deduped', true
    );
  END IF;

  v_start_date := now();
  v_end_date := v_start_date + (COALESCE(v_duration_days, 30) || ' days')::interval;

  -- Lock working wallet row to prevent concurrent double-spend.
  SELECT tw_id, tw_balance, tw_reserved_balance
    INTO v_wallet_id, v_wallet_balance, v_wallet_reserved
  FROM tbl_wallets
  WHERE tw_user_id = p_user_id
    AND tw_currency = COALESCE(p_currency, 'USDT')
    AND tw_wallet_type = 'working'
  FOR UPDATE;

  IF v_wallet_id IS NULL THEN
    RAISE EXCEPTION 'Wallet not found';
  END IF;

  IF COALESCE(v_wallet_reserved, 0) < v_plan_price THEN
    RAISE EXCEPTION 'Insufficient reserved balance';
  END IF;

  IF COALESCE(v_wallet_balance, 0) < v_plan_price THEN
    RAISE EXCEPTION 'Insufficient wallet balance';
  END IF;

  -- Create subscription + payment.
  INSERT INTO tbl_user_subscriptions (
    tus_user_id,
    tus_plan_id,
    tus_status,
    tus_start_date,
    tus_end_date,
    tus_payment_amount
  ) VALUES (
    p_user_id,
    p_plan_id,
    'active',
    v_start_date,
    v_end_date,
    v_plan_price
  )
  RETURNING tus_id INTO v_subscription_id;

  INSERT INTO tbl_payments (
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
    v_plan_price,
    COALESCE(p_currency, 'USDT'),
    'reserved_wallet',
    'completed',
    NULL,
    COALESCE(p_gateway_response, '{}'::jsonb)
  )
  RETURNING tp_id INTO v_payment_id;

  -- Debit reserved funds.
  UPDATE tbl_wallets
  SET tw_balance = COALESCE(tw_balance, 0) - v_plan_price,
      tw_reserved_balance = COALESCE(tw_reserved_balance, 0) - v_plan_price,
      tw_updated_at = now()
  WHERE tw_id = v_wallet_id;

  INSERT INTO tbl_wallet_transactions (
    twt_wallet_id,
    twt_user_id,
    twt_transaction_type,
    twt_amount,
    twt_description,
    twt_status,
    twt_reference_type,
    twt_reference_id,
    twt_created_at
  ) VALUES (
    v_wallet_id,
    p_user_id,
    'debit',
    v_plan_price,
    'Upgrade paid from reserved balance',
    'completed',
    'upgrade_from_reserved',
    v_payment_id::text,
    now()
  );

  RETURN jsonb_build_object(
    'success', true,
    'payment_id', v_payment_id,
    'subscription_id', v_subscription_id,
    'deduped', false
  );
END;
$$;

GRANT EXECUTE ON FUNCTION create_subscription_payment_from_reserved(
  uuid,
  uuid,
  text,
  jsonb
) TO authenticated;

