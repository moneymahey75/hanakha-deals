-- Admin-only test stats for validating launch package 2x/5x caps and the
-- absolute 200-day exhaustion window from Wallet Management.

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
      'admin_working_test',
      'admin_non_working_test',
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

CREATE OR REPLACE FUNCTION public.get_subscription_non_working_paid(p_subscription_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(tx.twt_amount), 0)::numeric
  FROM public.tbl_wallet_transactions tx
  LEFT JOIN public.tbl_user_reward_coupons rc
    ON rc.turc_id = tx.twt_reference_id
  WHERE tx.twt_status = 'completed'
    AND tx.twt_transaction_type = 'credit'
    AND (
      (
        tx.twt_reference_type = 'reward_coupon'
        AND rc.turc_subscription_id = p_subscription_id
      )
      OR (
        tx.twt_reference_type = 'admin_non_working_test'
        AND tx.twt_reference_id = p_subscription_id
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.get_subscription_working_paid(p_subscription_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    COALESCE((
      SELECT SUM(jc.tjc_commission_amount)
      FROM public.tbl_joining_commissions jc
      WHERE jc.tjc_recipient_subscription_id = p_subscription_id
        AND jc.tjc_status = 'credited'
    ), 0)
    +
    COALESCE((
      SELECT SUM(ri.trli_income_amount)
      FROM public.tbl_roi_level_incomes ri
      WHERE ri.trli_recipient_subscription_id = p_subscription_id
        AND ri.trli_status = 'credited'
    ), 0)
    +
    COALESCE((
      SELECT SUM(tx.twt_amount)
      FROM public.tbl_wallet_transactions tx
      WHERE tx.twt_reference_type = 'admin_working_test'
        AND tx.twt_reference_id = p_subscription_id
        AND tx.twt_status = 'completed'
        AND tx.twt_transaction_type = 'credit'
    ), 0)
  )::numeric;
$$;

GRANT EXECUTE ON FUNCTION public.get_subscription_non_working_paid(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_subscription_working_paid(uuid) TO authenticated, service_role;
