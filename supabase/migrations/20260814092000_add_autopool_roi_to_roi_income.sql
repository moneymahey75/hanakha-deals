-- Keep AutoPool ROI-to-ROI income as an independent earning track.  A member
-- who also has a Launch package receives the normal Launch ROI-to-ROI credit
-- plus this AutoPool credit (levels 1-5 only) for the same downline coupon.

CREATE TABLE IF NOT EXISTS public.tbl_autopool_20_roi_level_incomes (
  ta20rli_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ta20rli_assignment_id uuid NOT NULL REFERENCES public.tbl_user_reward_coupons(turc_id) ON DELETE CASCADE,
  ta20rli_source_user_id uuid NOT NULL REFERENCES public.tbl_users(tu_id) ON DELETE CASCADE,
  ta20rli_recipient_user_id uuid NOT NULL REFERENCES public.tbl_users(tu_id) ON DELETE CASCADE,
  ta20rli_recipient_subscription_id uuid NOT NULL REFERENCES public.tbl_user_subscriptions(tus_id) ON DELETE CASCADE,
  ta20rli_level integer NOT NULL CHECK (ta20rli_level BETWEEN 1 AND 5),
  ta20rli_source_reward_amount numeric(18, 6) NOT NULL CHECK (ta20rli_source_reward_amount >= 0),
  ta20rli_percentage numeric(9, 6) NOT NULL CHECK (ta20rli_percentage > 0),
  ta20rli_income_amount numeric(18, 6) NOT NULL CHECK (ta20rli_income_amount >= 0),
  ta20rli_required_directs integer NOT NULL DEFAULT 0 CHECK (ta20rli_required_directs >= 0),
  ta20rli_directs_at_award integer NOT NULL DEFAULT 0 CHECK (ta20rli_directs_at_award >= 0),
  ta20rli_status text NOT NULL DEFAULT 'credited' CHECK (ta20rli_status IN ('credited', 'locked', 'skipped')),
  ta20rli_skip_reason text,
  ta20rli_wallet_transaction_id uuid REFERENCES public.tbl_wallet_transactions(twt_id) ON DELETE SET NULL,
  ta20rli_created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tbl_autopool_20_roi_level_income_unique
    UNIQUE (ta20rli_assignment_id, ta20rli_level, ta20rli_recipient_user_id, ta20rli_recipient_subscription_id)
);

CREATE INDEX IF NOT EXISTS idx_autopool_20_roi_income_subscription
  ON public.tbl_autopool_20_roi_level_incomes (ta20rli_recipient_subscription_id, ta20rli_status);

ALTER TABLE public.tbl_autopool_20_roi_level_incomes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS autopool_20_roi_income_service_access ON public.tbl_autopool_20_roi_level_incomes;
CREATE POLICY autopool_20_roi_income_service_access ON public.tbl_autopool_20_roi_level_incomes
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS autopool_20_roi_income_user_read ON public.tbl_autopool_20_roi_level_incomes;
CREATE POLICY autopool_20_roi_income_user_read ON public.tbl_autopool_20_roi_level_incomes
  FOR SELECT TO authenticated
  USING (ta20rli_recipient_user_id = auth.uid() OR ta20rli_source_user_id = auth.uid() OR public.is_admin());
REVOKE ALL ON public.tbl_autopool_20_roi_level_incomes FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.tbl_autopool_20_roi_level_incomes TO authenticated;
GRANT ALL ON public.tbl_autopool_20_roi_level_incomes TO service_role;

-- Add the AutoPool ROI-to-ROI amounts to the same subscription-level working
-- income total used by cap_subscription_working_credit (5x of 20 = 100 USDT).
CREATE OR REPLACE FUNCTION public.get_subscription_working_paid(p_subscription_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    COALESCE((SELECT SUM(jc.tjc_commission_amount)
      FROM public.tbl_joining_commissions jc
      WHERE jc.tjc_recipient_subscription_id = p_subscription_id AND jc.tjc_status = 'credited'), 0)
    + COALESCE((SELECT SUM(ri.trli_income_amount)
      FROM public.tbl_roi_level_incomes ri
      WHERE ri.trli_recipient_subscription_id = p_subscription_id AND ri.trli_status = 'credited'), 0)
    + COALESCE((SELECT SUM(apri.ta20rli_income_amount)
      FROM public.tbl_autopool_20_roi_level_incomes apri
      WHERE apri.ta20rli_recipient_subscription_id = p_subscription_id AND apri.ta20rli_status = 'credited'), 0)
  )::numeric;
$$;

CREATE OR REPLACE FUNCTION public.award_autopool_20_roi_level_income_for_reward_coupon(p_assignment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assignment record;
  v_level integer;
  v_recipient_id uuid;
  v_percent numeric(9, 6);
  v_required_directs integer;
  v_recipient_subscription_id uuid;
  v_direct_count integer;
  v_requested_amount numeric(18, 6);
  v_amount numeric(18, 6);
  v_income_id uuid;
  v_wallet_id uuid;
  v_wallet_tx_id uuid;
  v_source_label text;
  v_credited_count integer := 0;
  v_locked_count integer := 0;
  v_skipped_count integer := 0;
  v_credited_total numeric(18, 6) := 0;
BEGIN
  SELECT rc.*, up.tup_sponsorship_number, up.tup_first_name, up.tup_last_name, u.tu_email
  INTO v_assignment
  FROM public.tbl_user_reward_coupons rc
  JOIN public.tbl_users u ON u.tu_id = rc.turc_user_id
  LEFT JOIN public.tbl_user_profiles up ON up.tup_user_id = u.tu_id
  WHERE rc.turc_id = p_assignment_id;

  IF NOT FOUND OR COALESCE(v_assignment.turc_reward_amount, 0) <= 0 THEN
    RETURN jsonb_build_object('success', false, 'reason', 'assignment_not_rewarded');
  END IF;

  v_source_label := COALESCE(NULLIF(trim(v_assignment.tup_sponsorship_number), ''), NULLIF(trim(concat_ws(' ', v_assignment.tup_first_name, v_assignment.tup_last_name)), ''), NULLIF(trim(v_assignment.tu_email), ''), v_assignment.turc_user_id::text);

  FOR v_level, v_recipient_id, v_percent, v_required_directs, v_recipient_subscription_id IN
    WITH RECURSIVE uplines AS (
      SELECT 1 AS level, COALESCE(parent_profile.tup_user_id, parent_by_ref.tu_id) AS recipient_user_id,
             ARRAY[source_user.tu_id, COALESCE(parent_profile.tup_user_id, parent_by_ref.tu_id)]::uuid[] AS path
      FROM public.tbl_users source_user
      LEFT JOIN public.tbl_user_profiles source_profile ON source_profile.tup_user_id = source_user.tu_id
      LEFT JOIN public.tbl_users parent_by_ref ON parent_by_ref.tu_id = source_user.tu_referrer_id
      LEFT JOIN public.tbl_user_profiles parent_profile
        ON public.normalize_sponsorship_key(parent_profile.tup_sponsorship_number) = public.normalize_sponsorship_key(source_profile.tup_parent_account)
      WHERE source_user.tu_id = v_assignment.turc_user_id
        AND COALESCE(parent_profile.tup_user_id, parent_by_ref.tu_id) IS NOT NULL
      UNION ALL
      SELECT u.level + 1, COALESCE(parent_profile.tup_user_id, parent_by_ref.tu_id),
             u.path || COALESCE(parent_profile.tup_user_id, parent_by_ref.tu_id)
      FROM uplines u
      JOIN public.tbl_users upline_user ON upline_user.tu_id = u.recipient_user_id
      LEFT JOIN public.tbl_user_profiles upline_profile ON upline_profile.tup_user_id = upline_user.tu_id
      LEFT JOIN public.tbl_users parent_by_ref ON parent_by_ref.tu_id = upline_user.tu_referrer_id
      LEFT JOIN public.tbl_user_profiles parent_profile
        ON public.normalize_sponsorship_key(parent_profile.tup_sponsorship_number) = public.normalize_sponsorship_key(upline_profile.tup_parent_account)
      WHERE u.level < 5
        AND COALESCE(parent_profile.tup_user_id, parent_by_ref.tu_id) IS NOT NULL
        AND COALESCE(parent_profile.tup_user_id, parent_by_ref.tu_id) <> ALL(u.path)
    ), deduped_uplines AS (
      SELECT DISTINCT ON (recipient_user_id) level, recipient_user_id
      FROM uplines ORDER BY recipient_user_id, level
    )
    SELECT u.level, u.recipient_user_id,
           CASE u.level WHEN 1 THEN 10 WHEN 2 THEN 5 WHEN 3 THEN 3 WHEN 4 THEN 2 WHEN 5 THEN 1 END::numeric(9,6),
           LEAST(u.level, 9)::integer,
           subscription.tus_id
    FROM deduped_uplines u
    JOIN public.tbl_user_subscriptions subscription ON subscription.tus_user_id = u.recipient_user_id
    JOIN public.tbl_subscription_plans plan ON plan.tsp_id = subscription.tus_plan_id
    WHERE u.recipient_user_id <> v_assignment.turc_user_id
      AND plan.tsp_product_code = 'autopool_20'
      AND public.is_subscription_earning_active(subscription.tus_id)
    ORDER BY u.level, subscription.tus_id
  LOOP
    v_direct_count := public.count_paid_direct_joins(v_recipient_id);
    v_requested_amount := ROUND((v_assignment.turc_reward_amount * v_percent / 100)::numeric, 6);

    IF NOT public.is_valid_working_income_customer(v_recipient_id) THEN
      INSERT INTO public.tbl_autopool_20_roi_level_incomes (ta20rli_assignment_id, ta20rli_source_user_id, ta20rli_recipient_user_id, ta20rli_recipient_subscription_id, ta20rli_level, ta20rli_source_reward_amount, ta20rli_percentage, ta20rli_income_amount, ta20rli_required_directs, ta20rli_directs_at_award, ta20rli_status, ta20rli_skip_reason)
      VALUES (p_assignment_id, v_assignment.turc_user_id, v_recipient_id, v_recipient_subscription_id, v_level, v_assignment.turc_reward_amount, v_percent, v_requested_amount, v_required_directs, v_direct_count, 'locked', 'recipient_not_active')
      ON CONFLICT DO NOTHING;
      v_locked_count := v_locked_count + 1;
      CONTINUE;
    END IF;

    IF v_direct_count < v_required_directs THEN
      INSERT INTO public.tbl_autopool_20_roi_level_incomes (ta20rli_assignment_id, ta20rli_source_user_id, ta20rli_recipient_user_id, ta20rli_recipient_subscription_id, ta20rli_level, ta20rli_source_reward_amount, ta20rli_percentage, ta20rli_income_amount, ta20rli_required_directs, ta20rli_directs_at_award, ta20rli_status, ta20rli_skip_reason)
      VALUES (p_assignment_id, v_assignment.turc_user_id, v_recipient_id, v_recipient_subscription_id, v_level, v_assignment.turc_reward_amount, v_percent, v_requested_amount, v_required_directs, v_direct_count, 'locked', 'direct_join_requirement_not_met')
      ON CONFLICT DO NOTHING;
      v_locked_count := v_locked_count + 1;
      CONTINUE;
    END IF;

    v_amount := public.cap_subscription_working_credit(v_recipient_subscription_id, v_requested_amount);
    IF v_amount <= 0 THEN
      PERFORM public.mark_subscription_exhausted_if_needed(v_recipient_subscription_id);
      INSERT INTO public.tbl_autopool_20_roi_level_incomes (ta20rli_assignment_id, ta20rli_source_user_id, ta20rli_recipient_user_id, ta20rli_recipient_subscription_id, ta20rli_level, ta20rli_source_reward_amount, ta20rli_percentage, ta20rli_income_amount, ta20rli_required_directs, ta20rli_directs_at_award, ta20rli_status, ta20rli_skip_reason)
      VALUES (p_assignment_id, v_assignment.turc_user_id, v_recipient_id, v_recipient_subscription_id, v_level, v_assignment.turc_reward_amount, v_percent, 0, v_required_directs, v_direct_count, 'skipped', 'working_5x_limit_reached')
      ON CONFLICT DO NOTHING;
      v_skipped_count := v_skipped_count + 1;
      CONTINUE;
    END IF;

    INSERT INTO public.tbl_autopool_20_roi_level_incomes (ta20rli_assignment_id, ta20rli_source_user_id, ta20rli_recipient_user_id, ta20rli_recipient_subscription_id, ta20rli_level, ta20rli_source_reward_amount, ta20rli_percentage, ta20rli_income_amount, ta20rli_required_directs, ta20rli_directs_at_award)
    VALUES (p_assignment_id, v_assignment.turc_user_id, v_recipient_id, v_recipient_subscription_id, v_level, v_assignment.turc_reward_amount, v_percent, v_amount, v_required_directs, v_direct_count)
    ON CONFLICT DO NOTHING
    RETURNING ta20rli_id INTO v_income_id;
    IF v_income_id IS NULL THEN CONTINUE; END IF;

    v_wallet_id := public.ensure_working_wallet(v_recipient_id);
    INSERT INTO public.tbl_wallet_transactions (twt_wallet_id, twt_user_id, twt_transaction_type, twt_amount, twt_description, twt_status, twt_reference_type, twt_reference_id, twt_created_at)
    VALUES (v_wallet_id, v_recipient_id, 'credit', v_amount, 'AutoPool Level ' || v_level || ' ROI to ROI income from ' || v_source_label, 'completed', 'roi_level_income', v_income_id, now())
    RETURNING twt_id INTO v_wallet_tx_id;
    UPDATE public.tbl_wallets SET tw_balance = COALESCE(tw_balance, 0) + v_amount, tw_updated_at = now() WHERE tw_id = v_wallet_id;
    UPDATE public.tbl_autopool_20_roi_level_incomes SET ta20rli_wallet_transaction_id = v_wallet_tx_id WHERE ta20rli_id = v_income_id;
    PERFORM public.mark_subscription_exhausted_if_needed(v_recipient_subscription_id);
    v_credited_count := v_credited_count + 1;
    v_credited_total := v_credited_total + v_amount;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'assignment_id', p_assignment_id, 'credited_count', v_credited_count, 'locked_count', v_locked_count, 'skipped_count', v_skipped_count, 'credited_total', v_credited_total);
END;
$$;

CREATE OR REPLACE FUNCTION public.trigger_award_autopool_20_roi_level_income()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.twt_transaction_type = 'credit'
     AND NEW.twt_status = 'completed'
     AND NEW.twt_reference_type = 'reward_coupon'
     AND NEW.twt_reference_id IS NOT NULL THEN
    PERFORM public.award_autopool_20_roi_level_income_for_reward_coupon(NEW.twt_reference_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_award_autopool_20_roi_level_income ON public.tbl_wallet_transactions;
CREATE TRIGGER trg_award_autopool_20_roi_level_income
AFTER INSERT ON public.tbl_wallet_transactions
FOR EACH ROW EXECUTE FUNCTION public.trigger_award_autopool_20_roi_level_income();

REVOKE EXECUTE ON FUNCTION public.award_autopool_20_roi_level_income_for_reward_coupon(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.award_autopool_20_roi_level_income_for_reward_coupon(uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
