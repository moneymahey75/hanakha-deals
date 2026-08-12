-- Restore the JSONB-safe AutoPool direct-income function.
-- This supersedes the original 20260808110000 definition if it was rerun manually.

CREATE OR REPLACE FUNCTION public.award_autopool_20_direct_income(p_payment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment record;
  v_parent_id uuid;
  v_amount numeric(18,6);
  v_wallet_id uuid;
  v_income_id uuid;
  v_wallet_tx_id uuid;
  v_parent_account text;
BEGIN
  SELECT p.tp_id, p.tp_user_id, p.tp_subscription_id, p.tp_payment_status, sp.tsp_product_code
  INTO v_payment
  FROM public.tbl_payments p
  JOIN public.tbl_user_subscriptions us ON us.tus_id = p.tp_subscription_id
  JOIN public.tbl_subscription_plans sp ON sp.tsp_id = us.tus_plan_id
  WHERE p.tp_id = p_payment_id;

  IF NOT FOUND OR v_payment.tp_payment_status <> 'completed' OR v_payment.tsp_product_code <> 'autopool_20' THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_completed_autopool_payment');
  END IF;

  IF EXISTS (SELECT 1 FROM public.tbl_autopool_20_direct_income WHERE ta20di_payment_id = p_payment_id) THEN
    RETURN jsonb_build_object('success', true, 'deduped', true);
  END IF;

  SELECT NULLIF(trim(profile.tup_parent_account), ''), user_record.tu_referrer_id
  INTO v_parent_account, v_parent_id
  FROM public.tbl_users user_record
  LEFT JOIN public.tbl_user_profiles profile ON profile.tup_user_id = user_record.tu_id
  WHERE user_record.tu_id = v_payment.tp_user_id;

  IF v_parent_id IS NULL AND v_parent_account IS NOT NULL THEN
    SELECT profile.tup_user_id INTO v_parent_id
    FROM public.tbl_user_profiles profile
    WHERE public.normalize_sponsorship_key(profile.tup_sponsorship_number) = public.normalize_sponsorship_key(v_parent_account)
    LIMIT 1;
  END IF;

  IF v_parent_id IS NULL OR v_parent_id = v_payment.tp_user_id
     OR NOT EXISTS (
       SELECT 1 FROM public.tbl_users
       WHERE tu_id = v_parent_id AND COALESCE(tu_is_active, false) AND COALESCE(tu_registration_paid, false)
     ) THEN
    INSERT INTO public.tbl_autopool_20_direct_income (
      ta20di_payment_id, ta20di_subscription_id, ta20di_joined_user_id,
      ta20di_parent_user_id, ta20di_amount, ta20di_status
    ) VALUES (
      p_payment_id, v_payment.tp_subscription_id, v_payment.tp_user_id, NULL, 0, 'skipped'
    ) ON CONFLICT (ta20di_payment_id) DO NOTHING;
    RETURN jsonb_build_object('success', true, 'credited', false, 'reason', 'eligible_parent_not_found');
  END IF;

  SELECT LEAST(20, GREATEST(0, COALESCE(NULLIF(tss_setting_value #>> '{}', '')::numeric, 2)))
  INTO v_amount
  FROM public.tbl_system_settings
  WHERE tss_setting_key = 'autopool_20_direct_income';
  v_amount := COALESCE(v_amount, 2);

  INSERT INTO public.tbl_autopool_20_direct_income (
    ta20di_payment_id, ta20di_subscription_id, ta20di_joined_user_id, ta20di_parent_user_id, ta20di_amount
  ) VALUES (
    p_payment_id, v_payment.tp_subscription_id, v_payment.tp_user_id, v_parent_id, v_amount
  ) ON CONFLICT (ta20di_payment_id) DO NOTHING
  RETURNING ta20di_id INTO v_income_id;

  IF v_income_id IS NULL THEN
    RETURN jsonb_build_object('success', true, 'deduped', true);
  END IF;

  v_wallet_id := public.ensure_working_wallet(v_parent_id);
  INSERT INTO public.tbl_wallet_transactions (
    twt_wallet_id, twt_user_id, twt_transaction_type, twt_amount,
    twt_description, twt_status, twt_reference_type, twt_reference_id, twt_created_at
  ) VALUES (
    v_wallet_id, v_parent_id, 'credit', v_amount,
    'Direct income from 20 USDT AutoPool purchase', 'completed',
    'autopool_20_direct_income', v_income_id, now()
  ) RETURNING twt_id INTO v_wallet_tx_id;

  UPDATE public.tbl_wallets
  SET tw_balance = COALESCE(tw_balance, 0) + v_amount, tw_updated_at = now()
  WHERE tw_id = v_wallet_id;

  UPDATE public.tbl_autopool_20_direct_income
  SET ta20di_wallet_transaction_id = v_wallet_tx_id
  WHERE ta20di_id = v_income_id;

  RETURN jsonb_build_object('success', true, 'credited', true, 'amount', v_amount, 'parent_user_id', v_parent_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.award_autopool_20_direct_income(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.award_autopool_20_direct_income(uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
