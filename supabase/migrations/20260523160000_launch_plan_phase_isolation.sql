/*
  Launch plan phase isolation.

  Plan type answers "registration or upgrade".
  Plan phase answers "prelaunch or launch".
*/

ALTER TABLE public.tbl_subscription_plans
ADD COLUMN IF NOT EXISTS tsp_plan_phase text NOT NULL DEFAULT 'prelaunch';

ALTER TABLE public.tbl_user_subscriptions
ADD COLUMN IF NOT EXISTS tus_plan_phase text NOT NULL DEFAULT 'prelaunch';

ALTER TABLE public.tbl_users
ADD COLUMN IF NOT EXISTS tu_current_plan_phase text NOT NULL DEFAULT 'prelaunch',
ADD COLUMN IF NOT EXISTS tu_launch_plan_activated_at timestamptz;

UPDATE public.tbl_subscription_plans
SET tsp_plan_phase = 'prelaunch'
WHERE tsp_plan_phase IS NULL OR tsp_plan_phase NOT IN ('prelaunch', 'launch');

UPDATE public.tbl_user_subscriptions us
SET tus_plan_phase = COALESCE(sp.tsp_plan_phase, 'prelaunch')
FROM public.tbl_subscription_plans sp
WHERE us.tus_plan_id = sp.tsp_id
  AND (us.tus_plan_phase IS NULL OR us.tus_plan_phase NOT IN ('prelaunch', 'launch'));

UPDATE public.tbl_users u
SET
  tu_current_plan_phase = 'launch',
  tu_launch_plan_activated_at = COALESCE(u.tu_launch_plan_activated_at, launch_sub.first_launch_start)
FROM (
  SELECT
    us.tus_user_id,
    MIN(us.tus_start_date) AS first_launch_start
  FROM public.tbl_user_subscriptions us
  JOIN public.tbl_subscription_plans sp ON sp.tsp_id = us.tus_plan_id
  WHERE us.tus_status = 'active'
    AND COALESCE(sp.tsp_plan_phase, us.tus_plan_phase, 'prelaunch') = 'launch'
  GROUP BY us.tus_user_id
) launch_sub
WHERE u.tu_id = launch_sub.tus_user_id;

ALTER TABLE public.tbl_subscription_plans
DROP CONSTRAINT IF EXISTS tbl_subscription_plans_phase_check;

ALTER TABLE public.tbl_subscription_plans
ADD CONSTRAINT tbl_subscription_plans_phase_check
CHECK (tsp_plan_phase IN ('prelaunch', 'launch'));

ALTER TABLE public.tbl_user_subscriptions
DROP CONSTRAINT IF EXISTS tbl_user_subscriptions_phase_check;

ALTER TABLE public.tbl_user_subscriptions
ADD CONSTRAINT tbl_user_subscriptions_phase_check
CHECK (tus_plan_phase IN ('prelaunch', 'launch'));

ALTER TABLE public.tbl_users
DROP CONSTRAINT IF EXISTS tbl_users_current_plan_phase_check;

ALTER TABLE public.tbl_users
ADD CONSTRAINT tbl_users_current_plan_phase_check
CHECK (tu_current_plan_phase IN ('prelaunch', 'launch'));

CREATE INDEX IF NOT EXISTS idx_subscription_plans_type_phase_active
ON public.tbl_subscription_plans (tsp_type, tsp_plan_phase, tsp_is_active, tsp_price);

CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user_phase_status
ON public.tbl_user_subscriptions (tus_user_id, tus_plan_phase, tus_status, tus_start_date DESC);

CREATE OR REPLACE FUNCTION public.get_user_active_plan_phase(p_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT COALESCE(sp.tsp_plan_phase, us.tus_plan_phase, 'prelaunch')
      FROM public.tbl_user_subscriptions us
      LEFT JOIN public.tbl_subscription_plans sp ON sp.tsp_id = us.tus_plan_id
      WHERE us.tus_user_id = p_user_id
        AND us.tus_status = 'active'
        AND (us.tus_end_date IS NULL OR us.tus_end_date > now())
      ORDER BY
        CASE WHEN COALESCE(sp.tsp_plan_phase, us.tus_plan_phase, 'prelaunch') = 'launch' THEN 0 ELSE 1 END,
        us.tus_start_date DESC
      LIMIT 1
    ),
    (
      SELECT COALESCE(u.tu_current_plan_phase, 'prelaunch')
      FROM public.tbl_users u
      WHERE u.tu_id = p_user_id
    ),
    'prelaunch'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_user_on_launch_plan(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.get_user_active_plan_phase(p_user_id) = 'launch';
$$;

CREATE OR REPLACE FUNCTION public.activate_user_plan_phase(
  p_user_id uuid,
  p_plan_phase text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan_phase text := lower(coalesce(p_plan_phase, 'prelaunch'));
BEGIN
  IF v_plan_phase NOT IN ('prelaunch', 'launch') THEN
    RAISE EXCEPTION 'Invalid plan phase';
  END IF;

  UPDATE public.tbl_users
  SET
    tu_current_plan_phase = v_plan_phase,
    tu_launch_plan_activated_at = CASE
      WHEN v_plan_phase = 'launch' THEN COALESCE(tu_launch_plan_activated_at, now())
      ELSE tu_launch_plan_activated_at
    END
  WHERE tu_id = p_user_id;

  IF v_plan_phase = 'launch' THEN
    UPDATE public.tbl_user_subscriptions
    SET tus_status = 'upgraded'
    WHERE tus_user_id = p_user_id
      AND tus_status = 'active'
      AND COALESCE(tus_plan_phase, 'prelaunch') = 'prelaunch';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_active_plan_phase(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_user_on_launch_plan(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.activate_user_plan_phase(uuid, text) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.create_registration_payment(
  uuid,
  uuid,
  numeric,
  text,
  text,
  text,
  text,
  jsonb
);

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
AS $$
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
$$;

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

CREATE OR REPLACE FUNCTION public.create_subscription_payment_from_reserved(
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
  v_plan_phase text;
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

  SELECT tsp_price, tsp_duration_days, tsp_type, COALESCE(tsp_plan_phase, 'prelaunch')
    INTO v_plan_price, v_duration_days, v_plan_type, v_plan_phase
  FROM public.tbl_subscription_plans
  WHERE tsp_id = p_plan_id
    AND tsp_is_active = true
  LIMIT 1;

  IF v_plan_price IS NULL THEN
    RAISE EXCEPTION 'Subscription plan not found';
  END IF;

  IF lower(coalesce(v_plan_type, '')) <> 'upgrade' THEN
    RAISE EXCEPTION 'Only upgrade plans can be paid from reserved balance';
  END IF;

  SELECT tus_id
    INTO v_subscription_id
  FROM public.tbl_user_subscriptions
  WHERE tus_user_id = p_user_id
    AND tus_plan_id = p_plan_id
    AND tus_status = 'active'
  LIMIT 1;

  IF v_subscription_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'payment_id', null,
      'subscription_id', v_subscription_id,
      'plan_phase', v_plan_phase,
      'deduped', true
    );
  END IF;

  v_start_date := now();
  v_end_date := v_start_date + (COALESCE(v_duration_days, 30) || ' days')::interval;

  SELECT tw_id, tw_balance, tw_reserved_balance
    INTO v_wallet_id, v_wallet_balance, v_wallet_reserved
  FROM public.tbl_wallets
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

  IF v_plan_phase = 'launch' THEN
    PERFORM public.activate_user_plan_phase(p_user_id, 'launch');
  END IF;

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
    v_plan_price,
    v_plan_phase
  )
  RETURNING tus_id INTO v_subscription_id;

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
    v_plan_price,
    COALESCE(p_currency, 'USDT'),
    'reserved_wallet',
    'completed',
    NULL,
    jsonb_build_object('plan_phase', v_plan_phase) || COALESCE(p_gateway_response, '{}'::jsonb)
  )
  RETURNING tp_id INTO v_payment_id;

  UPDATE public.tbl_wallets
  SET tw_balance = COALESCE(tw_balance, 0) - v_plan_price,
      tw_reserved_balance = COALESCE(tw_reserved_balance, 0) - v_plan_price,
      tw_updated_at = now()
  WHERE tw_id = v_wallet_id;

  INSERT INTO public.tbl_wallet_transactions (
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
    'plan_phase', v_plan_phase,
    'deduped', false
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_subscription_payment_from_reserved(
  uuid,
  uuid,
  text,
  jsonb
) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_upgrade_payment_with_reserved_and_chain(
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
  v_plan_phase text;
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

  SELECT tsp_price, tsp_duration_days, tsp_type, COALESCE(tsp_plan_phase, 'prelaunch')
    INTO v_plan_price, v_duration_days, v_plan_type, v_plan_phase
  FROM public.tbl_subscription_plans
  WHERE tsp_id = p_plan_id
    AND tsp_is_active = true
  LIMIT 1;

  IF v_plan_price IS NULL THEN
    RAISE EXCEPTION 'Subscription plan not found';
  END IF;

  IF lower(coalesce(v_plan_type, '')) <> 'upgrade' THEN
    RAISE EXCEPTION 'Only upgrade plans are supported';
  END IF;

  p_chain_amount := round(COALESCE(p_chain_amount, 0), 6);
  p_reserved_used := round(COALESCE(p_reserved_used, 0), 6);
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

  IF v_subscription_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'payment_id', null,
      'subscription_id', v_subscription_id,
      'plan_phase', v_plan_phase,
      'deduped', true
    );
  END IF;

  v_start_date := now();
  v_end_date := v_start_date + (COALESCE(v_duration_days, 30) || ' days')::interval;

  SELECT tw_id, tw_balance, tw_reserved_balance
    INTO v_wallet_id, v_wallet_balance, v_wallet_reserved
  FROM public.tbl_wallets
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

  IF v_plan_phase = 'launch' THEN
    PERFORM public.activate_user_plan_phase(p_user_id, 'launch');
  END IF;

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
    v_plan_price,
    v_plan_phase
  )
  RETURNING tus_id INTO v_subscription_id;

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
    p_chain_amount,
    COALESCE(p_currency, 'USDT'),
    CASE WHEN p_reserved_used > 0 THEN 'blockchain_plus_reserved' ELSE 'blockchain' END,
    'completed',
    p_transaction_id,
    jsonb_build_object(
      'plan_phase', v_plan_phase,
      'plan_price', v_plan_price,
      'chain_paid', p_chain_amount,
      'reserved_used', p_reserved_used
    ) || COALESCE(p_gateway_response, '{}'::jsonb)
  )
  RETURNING tp_id INTO v_payment_id;

  IF p_reserved_used > 0 THEN
    UPDATE public.tbl_wallets
    SET tw_balance = COALESCE(tw_balance, 0) - p_reserved_used,
        tw_reserved_balance = COALESCE(tw_reserved_balance, 0) - p_reserved_used,
        tw_updated_at = now()
    WHERE tw_id = v_wallet_id;

    INSERT INTO public.tbl_wallet_transactions (
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
    'plan_phase', v_plan_phase,
    'deduped', false
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_upgrade_payment_with_reserved_and_chain(
  uuid,
  uuid,
  numeric,
  numeric,
  text,
  text,
  jsonb
) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_wallet_balance(
  p_user_id uuid,
  p_amount numeric(18,8),
  p_transaction_type text,
  p_description text,
  p_reference_type text DEFAULT NULL,
  p_reference_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wallet_id uuid;
  v_current_balance numeric(18,8);
  v_new_balance numeric(18,8);
  v_transaction_id uuid;
BEGIN
  IF NOT public.is_user_active_member(p_user_id) THEN
    RAISE EXCEPTION 'Account is not active/verified or registration-paid';
  END IF;

  IF public.is_user_on_launch_plan(p_user_id)
    AND p_transaction_type = 'credit'
    AND COALESCE(p_reference_type, '') IN (
      'task_reward',
      'coupon_share',
      'registration_parent_income',
      'registration_parent_income_reserved',
      'mlm_level_reward',
      'mlm_level_reward_reserved'
    )
  THEN
    RAISE EXCEPTION 'Pre-Launch reward system is disabled for Launch plan users';
  END IF;

  SELECT tw_id, tw_balance INTO v_wallet_id, v_current_balance
  FROM public.tbl_wallets
  WHERE tw_user_id = p_user_id AND tw_currency = 'USDT'
  ORDER BY CASE WHEN tw_wallet_type = 'working' THEN 0 ELSE 1 END
  LIMIT 1;

  IF v_wallet_id IS NULL THEN
    RAISE EXCEPTION 'Wallet not found for user';
  END IF;

  IF p_transaction_type = 'credit' THEN
    v_new_balance := v_current_balance + p_amount;
  ELSIF p_transaction_type = 'debit' THEN
    IF v_current_balance < p_amount THEN
      RAISE EXCEPTION 'Insufficient balance';
    END IF;
    v_new_balance := v_current_balance - p_amount;
  ELSE
    RAISE EXCEPTION 'Invalid transaction type';
  END IF;

  UPDATE public.tbl_wallets
  SET tw_balance = v_new_balance, tw_updated_at = now()
  WHERE tw_id = v_wallet_id;

  INSERT INTO public.tbl_wallet_transactions (
    twt_wallet_id,
    twt_user_id,
    twt_transaction_type,
    twt_amount,
    twt_description,
    twt_reference_type,
    twt_reference_id
  ) VALUES (
    v_wallet_id,
    p_user_id,
    p_transaction_type,
    p_amount,
    p_description,
    p_reference_type,
    p_reference_id
  ) RETURNING twt_id INTO v_transaction_id;

  RETURN json_build_object(
    'success', true,
    'wallet_id', v_wallet_id,
    'transaction_id', v_transaction_id,
    'old_balance', v_current_balance,
    'new_balance', v_new_balance
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_wallet_balance(
  uuid,
  numeric,
  text,
  text,
  text,
  uuid
) TO authenticated, service_role;
