/*
  Create an upgrade subscription payment where part of the price is paid from
  the user's reserved wallet balance (working wallet), and the remainder is paid via blockchain.

  Example: plan price 50, reserved_used 20, chain_paid 30.
*/

CREATE OR REPLACE FUNCTION create_upgrade_payment_with_reserved_and_chain(
  p_user_id uuid,
  p_plan_id uuid,
  p_chain_amount numeric,
  p_reserved_used numeric,
  p_currency text DEFAULT 'USDT',
  p_transaction_id text DEFAULT NULL,
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
    RAISE EXCEPTION 'Only upgrade plans are supported';
  END IF;

  p_chain_amount := COALESCE(p_chain_amount, 0);
  p_reserved_used := COALESCE(p_reserved_used, 0);

  -- Normalize to 6 decimals (USDT precision in the app).
  p_chain_amount := round(p_chain_amount, 6);
  p_reserved_used := round(p_reserved_used, 6);
  v_plan_price := round(v_plan_price, 6);

  IF p_chain_amount < 0 OR p_reserved_used < 0 THEN
    RAISE EXCEPTION 'Invalid amounts';
  END IF;

  IF round((p_chain_amount + p_reserved_used), 6) <> v_plan_price THEN
    RAISE EXCEPTION 'Amount mismatch';
  END IF;

  IF p_transaction_id IS NOT NULL THEN
    SELECT tp_id, tp_subscription_id
      INTO v_payment_id, v_subscription_id
    FROM tbl_payments
    WHERE tp_transaction_id = p_transaction_id
    LIMIT 1;

    IF v_payment_id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'success', true,
        'payment_id', v_payment_id,
        'subscription_id', v_subscription_id,
        'deduped', true
      );
    END IF;
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

  IF p_reserved_used > 0 THEN
    IF COALESCE(v_wallet_reserved, 0) < p_reserved_used THEN
      RAISE EXCEPTION 'Insufficient reserved balance';
    END IF;

    IF COALESCE(v_wallet_balance, 0) < p_reserved_used THEN
      RAISE EXCEPTION 'Insufficient wallet balance';
    END IF;
  END IF;

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
    p_chain_amount,
    COALESCE(p_currency, 'USDT'),
    CASE WHEN p_reserved_used > 0 THEN 'blockchain_plus_reserved' ELSE 'blockchain' END,
    'completed',
    p_transaction_id,
    jsonb_build_object(
      'plan_price', v_plan_price,
      'chain_paid', p_chain_amount,
      'reserved_used', p_reserved_used
    ) || COALESCE(p_gateway_response, '{}'::jsonb)
  )
  RETURNING tp_id INTO v_payment_id;

  IF p_reserved_used > 0 THEN
    UPDATE tbl_wallets
    SET tw_balance = COALESCE(tw_balance, 0) - p_reserved_used,
        tw_reserved_balance = COALESCE(tw_reserved_balance, 0) - p_reserved_used,
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
      p_reserved_used,
      'Upgrade portion paid from reserved balance',
      'completed',
      'upgrade_from_reserved',
      v_payment_id::text,
      now()
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'payment_id', v_payment_id,
    'subscription_id', v_subscription_id,
    'deduped', false
  );
END;
$$;

GRANT EXECUTE ON FUNCTION create_upgrade_payment_with_reserved_and_chain(
  uuid,
  uuid,
  numeric,
  numeric,
  text,
  text,
  jsonb
) TO authenticated;
