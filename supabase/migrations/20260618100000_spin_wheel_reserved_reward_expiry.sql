-- Spin wheel launch rules:
-- - campaign window can be at most 2 days
-- - prize credits are reserved upgrade balance
-- - unused spin reserved balance expires after 72 hours

UPDATE public.tbl_spin_wheel_campaigns
SET tswc_end_at = tswc_start_at + interval '2 days'
WHERE tswc_start_at IS NOT NULL
  AND tswc_end_at IS NOT NULL
  AND tswc_end_at > tswc_start_at + interval '2 days';

ALTER TABLE public.tbl_spin_wheel_campaigns
  DROP CONSTRAINT IF EXISTS tbl_spin_wheel_campaigns_date_check;

ALTER TABLE public.tbl_spin_wheel_campaigns
  ADD CONSTRAINT tbl_spin_wheel_campaigns_date_check
  CHECK (
    tswc_end_at IS NULL
    OR tswc_start_at IS NULL
    OR (
      tswc_end_at > tswc_start_at
      AND tswc_end_at <= tswc_start_at + interval '2 days'
    )
  );

ALTER TABLE public.tbl_spin_wheel_spins
  ADD COLUMN IF NOT EXISTS tsws_reserved_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS tsws_reserved_expired_at timestamptz,
  ADD COLUMN IF NOT EXISTS tsws_reserved_expired_amount numeric(18,8) NOT NULL DEFAULT 0.00000000;

CREATE INDEX IF NOT EXISTS idx_spin_wheel_spins_reserved_expiry
  ON public.tbl_spin_wheel_spins(tsws_reserved_expires_at, tsws_reserved_expired_at)
  WHERE tsws_prize_amount > 0;

ALTER TABLE public.tbl_wallet_transactions
  DROP CONSTRAINT IF EXISTS tbl_wallet_transactions_twt_reference_type_check;

ALTER TABLE public.tbl_wallet_transactions
  ADD CONSTRAINT tbl_wallet_transactions_twt_reference_type_check
  CHECK (
    twt_reference_type IN (
      'task_reward',
      'coupon_share',
      'social_share',
      'admin_credit',
      'withdrawal',
      'deposit',
      'transfer',
      'registration_parent_income',
      'registration_parent_income_reserved',
      'upgrade_from_reserved',
      'registration_payment',
      'mlm_level_reward_5_15_30',
      'mlm_level_reward_15_45_90',
      'mlm_level_reward',
      'mlm_level_reward_reserved',
      'spin_wheel_prize',
      'spin_wheel_prize_expired',
      'reward_coupon',
      'roi_level_income',
      'joining_commission'
    )
  );

CREATE OR REPLACE FUNCTION public.expire_spin_wheel_reserved_rewards(p_user_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_wallet_id uuid;
  v_wallet_balance numeric(18,8);
  v_wallet_reserved numeric(18,8);
  v_available_to_expire numeric(18,8);
  v_expire_amount numeric(18,8);
  v_expired_total numeric(18,8) := 0;
  v_expired_count integer := 0;
BEGIN
  FOR r IN
    SELECT *
    FROM public.tbl_spin_wheel_spins
    WHERE tsws_prize_amount > 0
      AND tsws_reserved_expires_at IS NOT NULL
      AND tsws_reserved_expires_at <= now()
      AND tsws_reserved_expired_at IS NULL
      AND (p_user_id IS NULL OR tsws_user_id = p_user_id)
    ORDER BY tsws_reserved_expires_at, tsws_created_at, tsws_id
    FOR UPDATE
  LOOP
    SELECT tw_id, COALESCE(tw_balance, 0), COALESCE(tw_reserved_balance, 0)
    INTO v_wallet_id, v_wallet_balance, v_wallet_reserved
    FROM public.tbl_wallets
    WHERE tw_user_id = r.tsws_user_id
      AND tw_currency = 'USDT'
      AND tw_wallet_type = 'working'
    FOR UPDATE;

    IF v_wallet_id IS NULL THEN
      UPDATE public.tbl_spin_wheel_spins
      SET
        tsws_reserved_expired_at = now(),
        tsws_reserved_expired_amount = 0
      WHERE tsws_id = r.tsws_id;
      CONTINUE;
    END IF;

    v_available_to_expire := LEAST(
      COALESCE(r.tsws_prize_amount, 0),
      GREATEST(COALESCE(v_wallet_reserved, 0), 0),
      GREATEST(COALESCE(v_wallet_balance, 0), 0)
    );
    v_expire_amount := GREATEST(COALESCE(v_available_to_expire, 0), 0);

    IF v_expire_amount > 0 THEN
      UPDATE public.tbl_wallets
      SET
        tw_balance = GREATEST(COALESCE(tw_balance, 0) - v_expire_amount, 0),
        tw_reserved_balance = GREATEST(COALESCE(tw_reserved_balance, 0) - v_expire_amount, 0),
        tw_updated_at = now()
      WHERE tw_id = v_wallet_id;

      INSERT INTO public.tbl_wallet_transactions (
        twt_wallet_id,
        twt_user_id,
        twt_transaction_type,
        twt_amount,
        twt_currency,
        twt_description,
        twt_reference_type,
        twt_reference_id,
        twt_status,
        twt_created_at
      )
      VALUES (
        v_wallet_id,
        r.tsws_user_id,
        'debit',
        v_expire_amount,
        'USDT',
        'Expired unused spin wheel reserved reward after 72 hours',
        'spin_wheel_prize_expired',
        r.tsws_id,
        'completed',
        now()
      );
    END IF;

    UPDATE public.tbl_spin_wheel_spins
    SET
      tsws_reserved_expired_at = now(),
      tsws_reserved_expired_amount = v_expire_amount
    WHERE tsws_id = r.tsws_id;

    v_expired_total := v_expired_total + v_expire_amount;
    v_expired_count := v_expired_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'expired_count', v_expired_count,
    'expired_total', v_expired_total
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.expire_spin_wheel_reserved_rewards(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.expire_spin_wheel_reserved_rewards(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.credit_spin_wheel_reward_once(p_spin_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_spin public.tbl_spin_wheel_spins%ROWTYPE;
  v_wallet_id uuid;
  v_new_balance numeric(18,8) := 0;
BEGIN
  SELECT *
  INTO v_spin
  FROM public.tbl_spin_wheel_spins
  WHERE tsws_id = p_spin_id
  FOR UPDATE;

  IF v_spin.tsws_id IS NULL OR COALESCE(v_spin.tsws_prize_amount, 0) <= 0 THEN
    RETURN NULL;
  END IF;

  PERFORM public.expire_spin_wheel_reserved_rewards(v_spin.tsws_user_id);

  IF EXISTS (
    SELECT 1
    FROM public.tbl_wallet_transactions
    WHERE twt_reference_type = 'spin_wheel_prize'
      AND twt_reference_id = v_spin.tsws_id
  ) THEN
    SELECT COALESCE(tw_balance, 0)
    INTO v_new_balance
    FROM public.tbl_wallets
    WHERE tw_user_id = v_spin.tsws_user_id
      AND tw_currency = 'USDT'
      AND tw_wallet_type = 'working'
    LIMIT 1;

    RETURN COALESCE(v_new_balance, 0);
  END IF;

  INSERT INTO public.tbl_wallets (
    tw_user_id,
    tw_balance,
    tw_reserved_balance,
    tw_currency,
    tw_wallet_type,
    tw_is_active,
    tw_created_at,
    tw_updated_at
  )
  VALUES (
    v_spin.tsws_user_id,
    0.00000000,
    0.00000000,
    'USDT',
    'working',
    true,
    now(),
    now()
  )
  ON CONFLICT (tw_user_id, tw_currency, tw_wallet_type)
  DO UPDATE SET tw_updated_at = now()
  RETURNING tw_id INTO v_wallet_id;

  UPDATE public.tbl_wallets
  SET
    tw_balance = COALESCE(tw_balance, 0) + v_spin.tsws_prize_amount,
    tw_reserved_balance = COALESCE(tw_reserved_balance, 0) + v_spin.tsws_prize_amount,
    tw_updated_at = now()
  WHERE tw_id = v_wallet_id
  RETURNING tw_balance INTO v_new_balance;

  UPDATE public.tbl_spin_wheel_spins
  SET tsws_reserved_expires_at = COALESCE(tsws_reserved_expires_at, now() + interval '72 hours')
  WHERE tsws_id = v_spin.tsws_id;

  INSERT INTO public.tbl_wallet_transactions (
    twt_wallet_id,
    twt_user_id,
    twt_transaction_type,
    twt_amount,
    twt_currency,
    twt_description,
    twt_reference_type,
    twt_reference_id,
    twt_status,
    twt_created_at
  )
  VALUES (
    v_wallet_id,
    v_spin.tsws_user_id,
    'credit',
    v_spin.tsws_prize_amount,
    'USDT',
    'Spin wheel reserved reward for upgrade',
    'spin_wheel_prize',
    v_spin.tsws_id,
    'completed',
    now()
  );

  RETURN COALESCE(v_new_balance, 0);
EXCEPTION
  WHEN unique_violation THEN
    SELECT COALESCE(tw_balance, 0)
    INTO v_new_balance
    FROM public.tbl_wallets
    WHERE tw_user_id = v_spin.tsws_user_id
      AND tw_currency = 'USDT'
      AND tw_wallet_type = 'working'
    LIMIT 1;

    RETURN COALESCE(v_new_balance, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_active_spin_wheel_campaign()
RETURNS public.tbl_spin_wheel_campaigns
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.*
  FROM public.tbl_spin_wheel_campaigns c
  WHERE c.tswc_is_enabled = true
    AND (c.tswc_start_at IS NULL OR c.tswc_start_at <= now())
    AND (c.tswc_end_at IS NULL OR c.tswc_end_at >= now())
    AND (c.tswc_start_at IS NULL OR c.tswc_end_at IS NULL OR c.tswc_end_at <= c.tswc_start_at + interval '2 days')
    AND COALESCE((
      SELECT lower(trim(both '"' from tss_setting_value::text))
      FROM public.tbl_system_settings
      WHERE tss_setting_key = 'launch_phase'
      LIMIT 1
    ), 'prelaunch') = 'prelaunch'
  ORDER BY c.tswc_created_at DESC
  LIMIT 1;
$$;

DO $patch_reserved_payment_rpcs$
DECLARE
  v_function_definition text;
BEGIN
  SELECT pg_get_functiondef('public.customer_get_spin_wheel_status()'::regprocedure)
  INTO v_function_definition;

  IF v_function_definition IS NOT NULL
     AND position('expire_spin_wheel_reserved_rewards(v_user_id)' IN v_function_definition) = 0 THEN
    v_function_definition := replace(
      v_function_definition,
      '  SELECT * INTO v_campaign FROM public.get_active_spin_wheel_campaign();',
      '  PERFORM public.expire_spin_wheel_reserved_rewards(v_user_id);

  SELECT * INTO v_campaign FROM public.get_active_spin_wheel_campaign();'
    );
    EXECUTE v_function_definition;
  END IF;

  SELECT pg_get_functiondef('public.create_subscription_payment_from_reserved(uuid, uuid, text, jsonb)'::regprocedure)
  INTO v_function_definition;

  IF v_function_definition IS NOT NULL
     AND position('expire_spin_wheel_reserved_rewards(p_user_id)' IN v_function_definition) = 0 THEN
    v_function_definition := replace(
      v_function_definition,
      '  -- Lock working wallet row to prevent concurrent double-spend.',
      '  PERFORM public.expire_spin_wheel_reserved_rewards(p_user_id);

  -- Lock working wallet row to prevent concurrent double-spend.'
    );
    EXECUTE v_function_definition;
  END IF;

  SELECT pg_get_functiondef('public.create_upgrade_payment_with_reserved_and_chain(uuid, uuid, numeric, numeric, text, text, jsonb)'::regprocedure)
  INTO v_function_definition;

  IF v_function_definition IS NOT NULL
     AND position('expire_spin_wheel_reserved_rewards(p_user_id)' IN v_function_definition) = 0 THEN
    v_function_definition := replace(
      v_function_definition,
      '  -- Lock working wallet row to prevent concurrent double-spend.',
      '  PERFORM public.expire_spin_wheel_reserved_rewards(p_user_id);

  -- Lock working wallet row to prevent concurrent double-spend.'
    );
    EXECUTE v_function_definition;
  END IF;
END;
$patch_reserved_payment_rpcs$;

DO $expire_existing_spin_rewards$
BEGIN
  UPDATE public.tbl_spin_wheel_spins
  SET tsws_reserved_expires_at = COALESCE(tsws_reserved_expires_at, tsws_created_at + interval '72 hours')
  WHERE tsws_prize_amount > 0;

  PERFORM public.expire_spin_wheel_reserved_rewards(NULL::uuid);
END;
$expire_existing_spin_rewards$;

DO $schedule_spin_expiry$
DECLARE
  v_job_name text := 'shopclick-expire-spin-wheel-reserved-rewards';
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE NOTICE 'pg_cron extension is not available; schedule SELECT public.expire_spin_wheel_reserved_rewards(NULL::uuid) manually.';
  END;

  IF to_regprocedure('cron.schedule(text,text,text)') IS NOT NULL THEN
    BEGIN
      EXECUTE format('SELECT cron.unschedule(%L)', v_job_name);
    EXCEPTION
      WHEN OTHERS THEN
        NULL;
    END;

    EXECUTE format(
      'SELECT cron.schedule(%L, %L, %L)',
      v_job_name,
      '*/15 * * * *',
      'SELECT public.expire_spin_wheel_reserved_rewards(NULL::uuid);'
    );
  ELSE
    RAISE NOTICE 'cron.schedule is not available; schedule SELECT public.expire_spin_wheel_reserved_rewards(NULL::uuid) manually.';
  END IF;
END;
$schedule_spin_expiry$;

GRANT EXECUTE ON FUNCTION public.get_active_spin_wheel_campaign() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.credit_spin_wheel_reward_once(uuid) TO authenticated, service_role;
