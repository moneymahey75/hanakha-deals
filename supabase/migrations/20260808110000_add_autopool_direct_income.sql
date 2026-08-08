-- Credit the purchaser's direct parent in the existing working wallet for AutoPool purchases.

ALTER TABLE public.tbl_wallet_transactions
  DROP CONSTRAINT IF EXISTS tbl_wallet_transactions_twt_reference_type_check;

DO $$
DECLARE v_allowed text[]; v_existing text[];
BEGIN
  v_allowed := ARRAY[
    'task_reward', 'coupon_share', 'social_share', 'admin_credit', 'withdrawal',
    'admin_working_test', 'admin_non_working_test', 'deposit', 'transfer',
    'registration_parent_income', 'registration_parent_income_reserved', 'upgrade_from_reserved',
    'registration_payment', 'mlm_level_reward_5_15_30', 'mlm_level_reward_15_45_90',
    'mlm_level_reward', 'mlm_level_reward_reserved', 'spin_wheel_prize', 'spin_wheel_prize_expired',
    'reward_coupon', 'roi_level_income', 'joining_commission', 'autopool_20_milestone',
    'autopool_20_direct_income'
  ];
  SELECT array_agg(DISTINCT twt_reference_type) INTO v_existing
  FROM public.tbl_wallet_transactions WHERE twt_reference_type IS NOT NULL;
  v_allowed := v_allowed || COALESCE(v_existing, ARRAY[]::text[]);
  EXECUTE format(
    'ALTER TABLE public.tbl_wallet_transactions ADD CONSTRAINT tbl_wallet_transactions_twt_reference_type_check CHECK (twt_reference_type = ANY (%L::text[]))',
    v_allowed
  );
END $$;

CREATE TABLE IF NOT EXISTS public.tbl_autopool_20_direct_income (
  ta20di_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ta20di_payment_id uuid NOT NULL REFERENCES public.tbl_payments(tp_id) ON DELETE CASCADE,
  ta20di_subscription_id uuid NOT NULL REFERENCES public.tbl_user_subscriptions(tus_id) ON DELETE CASCADE,
  ta20di_joined_user_id uuid NOT NULL REFERENCES public.tbl_users(tu_id) ON DELETE CASCADE,
  ta20di_parent_user_id uuid REFERENCES public.tbl_users(tu_id) ON DELETE CASCADE,
  ta20di_amount numeric(18, 6) NOT NULL CHECK (ta20di_amount >= 0),
  ta20di_status text NOT NULL DEFAULT 'credited' CHECK (ta20di_status IN ('credited', 'skipped')),
  ta20di_wallet_transaction_id uuid REFERENCES public.tbl_wallet_transactions(twt_id) ON DELETE SET NULL,
  ta20di_created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tbl_autopool_20_direct_income_payment_unique UNIQUE (ta20di_payment_id),
  CONSTRAINT tbl_autopool_20_direct_income_parent_unique UNIQUE (ta20di_payment_id, ta20di_parent_user_id)
);

ALTER TABLE public.tbl_autopool_20_direct_income
  ALTER COLUMN ta20di_parent_user_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_autopool_20_direct_income_parent
  ON public.tbl_autopool_20_direct_income (ta20di_parent_user_id, ta20di_created_at DESC);

ALTER TABLE public.tbl_autopool_20_direct_income ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS autopool_20_direct_income_service_access ON public.tbl_autopool_20_direct_income;
CREATE POLICY autopool_20_direct_income_service_access ON public.tbl_autopool_20_direct_income
  FOR ALL TO service_role USING (true) WITH CHECK (true);
REVOKE ALL ON public.tbl_autopool_20_direct_income FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.tbl_autopool_20_direct_income TO service_role;

INSERT INTO public.tbl_system_settings (tss_setting_key, tss_setting_value, tss_description)
VALUES ('autopool_20_direct_income', '2', 'Direct parent income per completed 20 USDT AutoPool purchase in USDT')
ON CONFLICT (tss_setting_key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.award_autopool_20_direct_income(p_payment_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_payment record; v_parent_id uuid; v_amount numeric(18,6); v_wallet_id uuid;
  v_income_id uuid; v_wallet_tx_id uuid; v_parent_account text;
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

  SELECT NULLIF(trim(s.tup_parent_account), ''), u.tu_referrer_id
  INTO v_parent_account, v_parent_id
  FROM public.tbl_users u
  LEFT JOIN public.tbl_user_profiles s ON s.tup_user_id = u.tu_id
  WHERE u.tu_id = v_payment.tp_user_id;

  IF v_parent_id IS NULL AND v_parent_account IS NOT NULL THEN
    SELECT p.tup_user_id INTO v_parent_id
    FROM public.tbl_user_profiles p
    WHERE public.normalize_sponsorship_key(p.tup_sponsorship_number) = public.normalize_sponsorship_key(v_parent_account)
    LIMIT 1;
  END IF;

  IF v_parent_id IS NULL OR v_parent_id = v_payment.tp_user_id
     OR NOT EXISTS (SELECT 1 FROM public.tbl_users WHERE tu_id = v_parent_id AND COALESCE(tu_is_active, false) AND COALESCE(tu_registration_paid, false)) THEN
    INSERT INTO public.tbl_autopool_20_direct_income (ta20di_payment_id, ta20di_subscription_id, ta20di_joined_user_id, ta20di_parent_user_id, ta20di_amount, ta20di_status)
    SELECT p_payment_id, v_payment.tp_subscription_id, v_payment.tp_user_id, NULL, 0, 'skipped'
    ON CONFLICT (ta20di_payment_id) DO NOTHING;
    RETURN jsonb_build_object('success', true, 'credited', false, 'reason', 'eligible_parent_not_found');
  END IF;

  SELECT LEAST(20, GREATEST(0, COALESCE(NULLIF(trim(both '"' from tss_setting_value), '')::numeric, 2)))
  INTO v_amount FROM public.tbl_system_settings WHERE tss_setting_key = 'autopool_20_direct_income';
  v_amount := COALESCE(v_amount, 2);

  INSERT INTO public.tbl_autopool_20_direct_income
    (ta20di_payment_id, ta20di_subscription_id, ta20di_joined_user_id, ta20di_parent_user_id, ta20di_amount)
  VALUES (p_payment_id, v_payment.tp_subscription_id, v_payment.tp_user_id, v_parent_id, v_amount)
  ON CONFLICT (ta20di_payment_id) DO NOTHING
  RETURNING ta20di_id INTO v_income_id;

  IF v_income_id IS NULL THEN RETURN jsonb_build_object('success', true, 'deduped', true); END IF;
  v_wallet_id := public.ensure_working_wallet(v_parent_id);
  INSERT INTO public.tbl_wallet_transactions
    (twt_wallet_id, twt_user_id, twt_transaction_type, twt_amount, twt_description, twt_status, twt_reference_type, twt_reference_id, twt_created_at)
  VALUES (v_wallet_id, v_parent_id, 'credit', v_amount, 'Direct income from 20 USDT AutoPool purchase', 'completed', 'autopool_20_direct_income', v_income_id, now())
  RETURNING twt_id INTO v_wallet_tx_id;
  UPDATE public.tbl_wallets SET tw_balance = COALESCE(tw_balance, 0) + v_amount, tw_updated_at = now() WHERE tw_id = v_wallet_id;
  UPDATE public.tbl_autopool_20_direct_income SET ta20di_wallet_transaction_id = v_wallet_tx_id WHERE ta20di_id = v_income_id;
  RETURN jsonb_build_object('success', true, 'credited', true, 'amount', v_amount, 'parent_user_id', v_parent_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.award_autopool_20_direct_income(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.award_autopool_20_direct_income(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.trigger_award_autopool_20_direct_income()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.tp_payment_status = 'completed' AND NEW.tp_subscription_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR COALESCE(OLD.tp_payment_status, '') IS DISTINCT FROM NEW.tp_payment_status) THEN
    PERFORM public.award_autopool_20_direct_income(NEW.tp_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_award_autopool_20_direct_income ON public.tbl_payments;
CREATE TRIGGER trigger_award_autopool_20_direct_income
AFTER INSERT OR UPDATE OF tp_payment_status, tp_subscription_id ON public.tbl_payments
FOR EACH ROW EXECUTE FUNCTION public.trigger_award_autopool_20_direct_income();

NOTIFY pgrst, 'reload schema';
