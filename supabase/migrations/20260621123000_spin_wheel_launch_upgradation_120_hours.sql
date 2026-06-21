-- Move spin wheel to Launch upgradation:
-- - visible only during launch mode
-- - only old 5 USDT registration users can spin
-- - users who already have a launch package cannot spin
-- - unused spin reserved balance expires after 120 hours

UPDATE public.tbl_spin_wheel_spins
SET tsws_reserved_expires_at = tsws_created_at + interval '120 hours'
WHERE tsws_prize_amount > 0
  AND tsws_reserved_expired_at IS NULL
  AND (
    tsws_reserved_expires_at IS NULL
    OR tsws_reserved_expires_at = tsws_created_at + interval '72 hours'
    OR tsws_reserved_expires_at > now()
    OR tsws_created_at + interval '120 hours' > now()
  );

CREATE OR REPLACE FUNCTION public.is_spin_wheel_launch_upgrade_eligible(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.tbl_user_subscriptions us
      JOIN public.tbl_subscription_plans sp ON sp.tsp_id = us.tus_plan_id
      WHERE us.tus_user_id = p_user_id
        AND COALESCE(us.tus_plan_phase, sp.tsp_plan_phase, 'prelaunch') <> 'launch'
        AND lower(COALESCE(sp.tsp_type::text, 'registration')) = 'registration'
        AND round(COALESCE(us.tus_payment_amount, sp.tsp_price, 0)::numeric, 6) = 5
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.tbl_user_subscriptions us
      JOIN public.tbl_subscription_plans sp ON sp.tsp_id = us.tus_plan_id
      WHERE us.tus_user_id = p_user_id
        AND COALESCE(us.tus_plan_phase, sp.tsp_plan_phase, 'prelaunch') = 'launch'
        AND us.tus_status IN ('active', 'upgraded')
        AND us.tus_exhausted_at IS NULL
        AND (us.tus_end_date IS NULL OR us.tus_end_date > now())
    );
$$;

REVOKE EXECUTE ON FUNCTION public.is_spin_wheel_launch_upgrade_eligible(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_spin_wheel_launch_upgrade_eligible(uuid) TO authenticated, service_role;

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
    ), 'prelaunch') = 'launched'
  ORDER BY c.tswc_created_at DESC
  LIMIT 1;
$$;

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
        'Expired unused spin wheel reserved reward after 120 hours',
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
  SET tsws_reserved_expires_at = COALESCE(tsws_reserved_expires_at, now() + interval '120 hours')
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
    'Spin wheel reserved reward for launch upgrade',
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

CREATE OR REPLACE FUNCTION public.customer_get_spin_wheel_status()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_campaign public.tbl_spin_wheel_campaigns%ROWTYPE;
  v_spin public.tbl_spin_wheel_spins%ROWTYPE;
  v_eligible boolean := false;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('active', false, 'hasSpun', false, 'eligible', false, 'message', 'Login required.');
  END IF;

  PERFORM public.expire_spin_wheel_reserved_rewards(v_user_id);

  SELECT public.is_spin_wheel_launch_upgrade_eligible(v_user_id) INTO v_eligible;

  SELECT *
  INTO v_spin
  FROM public.tbl_spin_wheel_spins
  WHERE tsws_user_id = v_user_id
  ORDER BY tsws_created_at DESC
  LIMIT 1;

  IF v_spin.tsws_id IS NOT NULL THEN
    PERFORM public.credit_spin_wheel_reward_once(v_spin.tsws_id);

    RETURN jsonb_build_object(
      'active', false,
      'hasSpun', true,
      'eligible', v_eligible,
      'spunAt', v_spin.tsws_created_at,
      'prizeAmount', v_spin.tsws_prize_amount,
      'outcome', v_spin.tsws_outcome,
      'message', 'You have already used your spin.'
    );
  END IF;

  IF NOT v_eligible THEN
    RETURN jsonb_build_object(
      'active', false,
      'hasSpun', false,
      'eligible', false,
      'message', 'Spin wheel is only available for old 5 USDT users before launch upgrade.'
    );
  END IF;

  SELECT * INTO v_campaign FROM public.get_active_spin_wheel_campaign();

  IF v_campaign.tswc_id IS NULL THEN
    RETURN jsonb_build_object('active', false, 'hasSpun', false, 'eligible', true, 'message', 'Spin wheel is not available right now.');
  END IF;

  RETURN jsonb_build_object(
    'active', true,
    'hasSpun', false,
    'eligible', true,
    'campaignId', v_campaign.tswc_id,
    'campaignName', v_campaign.tswc_name,
    'message', 'Spin available.'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.customer_spin_wheel()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_campaign public.tbl_spin_wheel_campaigns%ROWTYPE;
  v_existing_spin public.tbl_spin_wheel_spins%ROWTYPE;
  v_prize_amount numeric(18,8) := 0;
  v_outcome text := 'better_luck';
  v_spin_id uuid;
  v_new_balance numeric(18,8) := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Login required.';
  END IF;

  IF NOT public.is_spin_wheel_launch_upgrade_eligible(v_user_id) THEN
    RAISE EXCEPTION 'Spin wheel is only available for old 5 USDT users before launch upgrade.';
  END IF;

  SELECT * INTO v_existing_spin
  FROM public.tbl_spin_wheel_spins
  WHERE tsws_user_id = v_user_id
  LIMIT 1;

  IF v_existing_spin.tsws_id IS NOT NULL THEN
    v_new_balance := COALESCE(public.credit_spin_wheel_reward_once(v_existing_spin.tsws_id), 0);

    RETURN jsonb_build_object(
      'success', false,
      'hasSpun', true,
      'prizeAmount', v_existing_spin.tsws_prize_amount,
      'outcome', v_existing_spin.tsws_outcome,
      'newBalance', v_new_balance,
      'message', 'You have already used your spin.'
    );
  END IF;

  SELECT * INTO v_campaign FROM public.get_active_spin_wheel_campaign();

  IF v_campaign.tswc_id IS NULL THEN
    RAISE EXCEPTION 'Spin wheel is not available right now.';
  END IF;

  SELECT COALESCE(a.tswa_prize_amount, 0)
  INTO v_prize_amount
  FROM public.tbl_spin_wheel_assignments a
  WHERE a.tswa_campaign_id = v_campaign.tswc_id
    AND a.tswa_user_id = v_user_id
  LIMIT 1;

  v_prize_amount := COALESCE(v_prize_amount, 0);
  v_outcome := CASE WHEN v_prize_amount > 0 THEN 'prize' ELSE 'better_luck' END;

  INSERT INTO public.tbl_spin_wheel_spins (
    tsws_campaign_id,
    tsws_user_id,
    tsws_prize_amount,
    tsws_outcome
  )
  VALUES (
    v_campaign.tswc_id,
    v_user_id,
    v_prize_amount,
    v_outcome
  )
  RETURNING tsws_id INTO v_spin_id;

  IF v_prize_amount > 0 THEN
    v_new_balance := COALESCE(public.credit_spin_wheel_reward_once(v_spin_id), 0);
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'hasSpun', true,
    'campaignId', v_campaign.tswc_id,
    'campaignName', v_campaign.tswc_name,
    'spinId', v_spin_id,
    'prizeAmount', v_prize_amount,
    'outcome', v_outcome,
    'newBalance', v_new_balance,
    'message', CASE
      WHEN v_prize_amount > 0 THEN 'Congratulations! Your spin reward has been added to your reserved wallet for launch upgrade.'
      ELSE 'Better luck next time.'
    END
  );
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object(
      'success', false,
      'hasSpun', true,
      'prizeAmount', 0,
      'outcome', 'better_luck',
      'message', 'You have already used your spin.'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_active_spin_wheel_campaign() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.credit_spin_wheel_reward_once(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.expire_spin_wheel_reserved_rewards(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.customer_get_spin_wheel_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.customer_spin_wheel() TO authenticated;
