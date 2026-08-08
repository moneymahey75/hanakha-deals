-- MANUAL ROLLBACK ONLY.
-- Run this script only if the forward migration must be reverted.
-- It restores the function implementations that preceded
-- 20260808120000_harden_spin_expiry_and_json_settings.sql.

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
      SET tsws_reserved_expired_at = now(), tsws_reserved_expired_amount = 0
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
      SET tw_balance = GREATEST(COALESCE(tw_balance, 0) - v_expire_amount, 0),
          tw_reserved_balance = GREATEST(COALESCE(tw_reserved_balance, 0) - v_expire_amount, 0),
          tw_updated_at = now()
      WHERE tw_id = v_wallet_id;

      INSERT INTO public.tbl_wallet_transactions (
        twt_wallet_id, twt_user_id, twt_transaction_type, twt_amount,
        twt_currency, twt_description, twt_reference_type, twt_reference_id,
        twt_status, twt_created_at
      )
      VALUES (
        v_wallet_id, r.tsws_user_id, 'debit', v_expire_amount, 'USDT',
        'Expired unused spin wheel reserved reward after 120 hours',
        'spin_wheel_prize_expired', r.tsws_id, 'completed', now()
      );
    END IF;

    UPDATE public.tbl_spin_wheel_spins
    SET tsws_reserved_expired_at = now(),
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

CREATE OR REPLACE FUNCTION public.get_reward_wallet_withdrawal_status()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_min_amount numeric := 10;
  v_balance numeric := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT COALESCE((tss_setting_value::jsonb)::numeric, 10)
  INTO v_min_amount
  FROM public.tbl_system_settings
  WHERE tss_setting_key = 'reward_withdrawal_min_amount'
  LIMIT 1;

  SELECT COALESCE(tw_balance, 0)
  INTO v_balance
  FROM public.tbl_wallets
  WHERE tw_user_id = v_user_id
    AND tw_currency = 'USDT'
    AND tw_wallet_type = 'reward'
  LIMIT 1;

  RETURN jsonb_build_object(
    'balance', COALESCE(v_balance, 0),
    'minimum_amount', COALESCE(v_min_amount, 10),
    'can_withdraw', COALESCE(v_balance, 0) >= COALESCE(v_min_amount, 10)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.expire_spin_wheel_reserved_rewards(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_reward_wallet_withdrawal_status() TO authenticated;

NOTIFY pgrst, 'reload schema';
