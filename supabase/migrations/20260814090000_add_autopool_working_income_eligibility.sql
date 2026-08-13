-- A completed 20 USDT AutoPool subscription is a working-income package for
-- direct and ROI-to-ROI income only.  It intentionally remains outside the
-- Launch-package/daily-coupon eligibility path.

CREATE OR REPLACE FUNCTION public.is_subscription_earning_active(p_subscription_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tbl_user_subscriptions us
    JOIN public.tbl_subscription_plans sp ON sp.tsp_id = us.tus_plan_id
    WHERE us.tus_id = p_subscription_id
      AND us.tus_status IN ('active', 'upgraded')
      AND us.tus_exhausted_at IS NULL
      AND (us.tus_end_date IS NULL OR us.tus_end_date > now())
      AND COALESCE(public.get_subscription_plan_amount(us.tus_id), 0) > 0
      AND COALESCE(public.get_subscription_working_paid(us.tus_id), 0) <
          (COALESCE(public.get_subscription_plan_amount(us.tus_id), 0) * 5)
      AND (
        sp.tsp_product_code = 'autopool_20'
        OR (
          COALESCE(us.tus_plan_phase, sp.tsp_plan_phase, 'prelaunch') = 'launch'
          AND COALESCE(public.get_subscription_day_number(us.tus_id), 1) <= 200
          AND COALESCE(public.get_subscription_total_paid(us.tus_id), 0) <
              (COALESCE(public.get_subscription_plan_amount(us.tus_id), 0) * 5)
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.mark_subscription_exhausted_if_needed(p_subscription_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan_amount numeric := COALESCE(public.get_subscription_plan_amount(p_subscription_id), 0);
  v_non_working_paid numeric := COALESCE(public.get_subscription_non_working_paid(p_subscription_id), 0);
  v_working_paid numeric := COALESCE(public.get_subscription_working_paid(p_subscription_id), 0);
  v_total_paid numeric := 0;
  v_day_number integer := NULL;
  v_is_autopool boolean := false;
  v_reason text := NULL;
BEGIN
  IF p_subscription_id IS NULL OR v_plan_amount <= 0 THEN
    RETURN jsonb_build_object('exhausted', false, 'reason', 'invalid_subscription');
  END IF;

  SELECT
    sp.tsp_product_code = 'autopool_20',
    COALESCE(public.get_subscription_day_number(us.tus_id), 1)
  INTO v_is_autopool, v_day_number
  FROM public.tbl_user_subscriptions us
  JOIN public.tbl_subscription_plans sp ON sp.tsp_id = us.tus_plan_id
  WHERE us.tus_id = p_subscription_id;

  v_total_paid := ROUND((v_non_working_paid + v_working_paid)::numeric, 6);

  IF v_is_autopool THEN
    IF v_working_paid >= (v_plan_amount * 5) THEN
      v_reason := 'working_5x_limit_reached';
    END IF;
  ELSIF v_total_paid >= (v_plan_amount * 5) THEN
    v_reason := 'total_5x_limit_reached';
  ELSIF v_day_number > 200 THEN
    v_reason := 'package_200_day_window_completed';
  END IF;

  IF v_reason IS NOT NULL THEN
    UPDATE public.tbl_user_subscriptions
    SET tus_status = 'exhausted',
        tus_exhausted_at = COALESCE(tus_exhausted_at, now()),
        tus_exhaustion_reason = COALESCE(tus_exhaustion_reason, v_reason)
    WHERE tus_id = p_subscription_id
      AND tus_status IN ('active', 'upgraded')
      AND tus_exhausted_at IS NULL;
  END IF;

  RETURN jsonb_build_object(
    'exhausted', v_reason IS NOT NULL,
    'reason', v_reason,
    'plan_amount', v_plan_amount,
    'day_number', v_day_number,
    'non_working_paid', v_non_working_paid,
    'working_paid', v_working_paid,
    'total_paid', v_total_paid,
    'target_income', v_plan_amount * 5,
    'remaining_income', GREATEST(0, (v_plan_amount * 5) - v_total_paid)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_user_active_working_income_subscription(p_user_id uuid)
RETURNS TABLE (
  subscription_id uuid,
  plan_amount numeric,
  non_working_paid numeric,
  working_paid numeric,
  non_working_remaining numeric,
  working_remaining numeric,
  day_number integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    launch.subscription_id, launch.plan_amount, launch.non_working_paid,
    launch.working_paid, launch.non_working_remaining, launch.working_remaining,
    launch.day_number
  FROM public.get_user_active_earning_subscription(p_user_id) launch

  UNION ALL

  SELECT
    us.tus_id,
    public.get_subscription_plan_amount(us.tus_id),
    0::numeric,
    public.get_subscription_working_paid(us.tus_id),
    0::numeric,
    GREATEST(0, (public.get_subscription_plan_amount(us.tus_id) * 5) - public.get_subscription_working_paid(us.tus_id)),
    1
  FROM public.tbl_user_subscriptions us
  JOIN public.tbl_subscription_plans sp ON sp.tsp_id = us.tus_plan_id
  WHERE us.tus_user_id = p_user_id
    AND sp.tsp_product_code = 'autopool_20'
    AND public.is_subscription_earning_active(us.tus_id)
    AND NOT EXISTS (
      SELECT 1 FROM public.get_user_active_earning_subscription(p_user_id)
    )
  ORDER BY plan_amount DESC, subscription_id
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_valid_working_income_customer(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tbl_users u
    WHERE u.tu_id = p_user_id
      AND u.tu_user_type = 'customer'
      AND COALESCE(u.tu_is_dummy, false) = false
      AND COALESCE(u.tu_is_active, false) = true
      AND EXISTS (
        SELECT 1
        FROM public.get_user_active_working_income_subscription(u.tu_id)
      )
  );
$$;

-- Direct-count qualifications stay Launch-only; this preserves the existing
-- 3-direct and 9-direct requirements for levels 2 and 3.
CREATE OR REPLACE FUNCTION public.is_valid_roi_direct_customer(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tbl_users u
    WHERE u.tu_id = p_user_id
      AND u.tu_user_type = 'customer'
      AND COALESCE(u.tu_is_dummy, false) = false
      AND COALESCE(u.tu_is_active, false) = true
      AND COALESCE(u.tu_registration_paid, false) = true
      AND public.meets_current_verification_requirements(u.tu_email_verified, u.tu_mobile_verified)
      AND public.user_has_active_earning_package(u.tu_id)
  );
$$;

CREATE OR REPLACE FUNCTION public.get_user_roi_level_cap(p_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM public.get_user_active_earning_subscriptions(p_user_id) active WHERE active.plan_amount >= 200) THEN 15
    WHEN EXISTS (SELECT 1 FROM public.get_user_active_earning_subscriptions(p_user_id) active WHERE active.plan_amount >= 100) THEN 10
    WHEN EXISTS (SELECT 1 FROM public.get_user_active_earning_subscriptions(p_user_id) active WHERE active.plan_amount >= 50) THEN 7
    ELSE 0
  END;
$$;

CREATE OR REPLACE FUNCTION public.get_user_active_earning_subscription_for_roi_level(
  p_user_id uuid,
  p_level integer
)
RETURNS TABLE (
  subscription_id uuid,
  plan_amount numeric,
  non_working_paid numeric,
  working_paid numeric,
  non_working_remaining numeric,
  working_remaining numeric,
  day_number integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    active.subscription_id,
    active.plan_amount,
    active.non_working_paid,
    active.working_paid,
    active.non_working_remaining,
    active.working_remaining,
    active.day_number
  FROM public.get_user_active_earning_subscriptions(p_user_id) active
  WHERE active.plan_amount >= COALESCE(public.get_required_roi_package_amount_for_level(p_level), 999999999)
  ORDER BY active.plan_amount ASC, active.start_date ASC NULLS LAST, active.subscription_id
  LIMIT 1;
$$;

-- Keep the existing Launch-payment source rule.  The recipient may now use
-- either a normal Launch earning subscription or an active AutoPool package.
CREATE OR REPLACE FUNCTION public.award_launch_joining_commissions_for_payment(p_payment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment record;
  v_level integer;
  v_recipient_id uuid;
  v_percent numeric(9, 6);
  v_required_directs integer;
  v_direct_count integer;
  v_recipient_subscription_id uuid;
  v_requested_amount numeric(18, 6);
  v_amount numeric(18, 6);
  v_commission_id uuid;
  v_wallet_id uuid;
  v_wallet_tx_id uuid;
  v_joined_label text;
  v_credited_total numeric(18, 6) := 0;
  v_credit_count integer := 0;
  v_locked_count integer := 0;
  v_skipped_count integer := 0;
BEGIN
  SELECT p.tp_user_id, p.tp_subscription_id, p.tp_payment_status, p.tp_amount,
         us.tus_payment_amount, sp.tsp_price,
         COALESCE(us.tus_plan_phase, sp.tsp_plan_phase, 'prelaunch') AS plan_phase,
         up.tup_sponsorship_number, up.tup_first_name, up.tup_last_name, u.tu_email
  INTO v_payment
  FROM public.tbl_payments p
  JOIN public.tbl_user_subscriptions us ON us.tus_id = p.tp_subscription_id
  JOIN public.tbl_subscription_plans sp ON sp.tsp_id = us.tus_plan_id
  JOIN public.tbl_users u ON u.tu_id = p.tp_user_id
  LEFT JOIN public.tbl_user_profiles up ON up.tup_user_id = u.tu_id
  WHERE p.tp_id = p_payment_id;

  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'reason', 'payment_not_found'); END IF;
  IF v_payment.tp_payment_status <> 'completed' THEN RETURN jsonb_build_object('success', false, 'reason', 'payment_not_completed'); END IF;
  IF v_payment.plan_phase <> 'launch' THEN RETURN jsonb_build_object('success', false, 'reason', 'not_launch_plan'); END IF;

  v_joined_label := COALESCE(NULLIF(trim(v_payment.tup_sponsorship_number), ''), NULLIF(trim(concat_ws(' ', v_payment.tup_first_name, v_payment.tup_last_name)), ''), NULLIF(trim(v_payment.tu_email), ''), v_payment.tp_user_id::text);

  FOR v_level, v_recipient_id, v_percent, v_required_directs IN
    WITH RECURSIVE uplines AS (
      SELECT 1 AS level, parent.tu_id AS recipient_user_id
      FROM public.tbl_users joined JOIN public.tbl_users parent ON parent.tu_id = joined.tu_referrer_id
      WHERE joined.tu_id = v_payment.tp_user_id
      UNION ALL
      SELECT u.level + 1, parent.tu_id
      FROM uplines u
      JOIN public.tbl_users upline ON upline.tu_id = u.recipient_user_id
      JOIN public.tbl_users parent ON parent.tu_id = upline.tu_referrer_id
      WHERE u.level < 3
    )
    SELECT level, recipient_user_id,
           CASE level WHEN 1 THEN 7.0 WHEN 2 THEN 1.5 WHEN 3 THEN 1.0 END::numeric(9,6),
           CASE level WHEN 1 THEN 0 WHEN 2 THEN 3 WHEN 3 THEN 9 END
    FROM uplines ORDER BY level
  LOOP
    v_direct_count := public.count_paid_direct_joins(v_recipient_id);
    v_requested_amount := ROUND((COALESCE(v_payment.tus_payment_amount, v_payment.tsp_price, v_payment.tp_amount, 0) * v_percent / 100)::numeric, 6);
    SELECT subscription_id INTO v_recipient_subscription_id
    FROM public.get_user_active_working_income_subscription(v_recipient_id) LIMIT 1;

    IF v_recipient_subscription_id IS NULL OR NOT public.is_valid_working_income_customer(v_recipient_id) THEN
      INSERT INTO public.tbl_joining_commissions (tjc_payment_id, tjc_subscription_id, tjc_joined_user_id, tjc_recipient_user_id, tjc_level, tjc_plan_amount, tjc_percentage, tjc_commission_amount, tjc_required_direct_joins, tjc_direct_joins_at_award, tjc_status, tjc_skip_reason, tjc_recipient_subscription_id)
      VALUES (p_payment_id, v_payment.tp_subscription_id, v_payment.tp_user_id, v_recipient_id, v_level, COALESCE(v_payment.tus_payment_amount, v_payment.tsp_price, v_payment.tp_amount, 0), v_percent, v_requested_amount, v_required_directs, v_direct_count, 'locked', 'no_active_earning_package', v_recipient_subscription_id)
      ON CONFLICT (tjc_payment_id, tjc_level, tjc_recipient_user_id) DO NOTHING;
      v_locked_count := v_locked_count + 1;
      CONTINUE;
    END IF;

    IF v_direct_count < v_required_directs THEN
      INSERT INTO public.tbl_joining_commissions (tjc_payment_id, tjc_subscription_id, tjc_joined_user_id, tjc_recipient_user_id, tjc_level, tjc_plan_amount, tjc_percentage, tjc_commission_amount, tjc_required_direct_joins, tjc_direct_joins_at_award, tjc_status, tjc_skip_reason, tjc_recipient_subscription_id)
      VALUES (p_payment_id, v_payment.tp_subscription_id, v_payment.tp_user_id, v_recipient_id, v_level, COALESCE(v_payment.tus_payment_amount, v_payment.tsp_price, v_payment.tp_amount, 0), v_percent, v_requested_amount, v_required_directs, v_direct_count, 'locked', 'direct_join_requirement_not_met', v_recipient_subscription_id)
      ON CONFLICT (tjc_payment_id, tjc_level, tjc_recipient_user_id) DO NOTHING;
      v_locked_count := v_locked_count + 1;
      CONTINUE;
    END IF;

    v_amount := public.cap_subscription_working_credit(v_recipient_subscription_id, v_requested_amount);
    IF v_amount <= 0 THEN
      PERFORM public.mark_subscription_exhausted_if_needed(v_recipient_subscription_id);
      INSERT INTO public.tbl_joining_commissions (tjc_payment_id, tjc_subscription_id, tjc_joined_user_id, tjc_recipient_user_id, tjc_level, tjc_plan_amount, tjc_percentage, tjc_commission_amount, tjc_required_direct_joins, tjc_direct_joins_at_award, tjc_status, tjc_skip_reason, tjc_recipient_subscription_id)
      VALUES (p_payment_id, v_payment.tp_subscription_id, v_payment.tp_user_id, v_recipient_id, v_level, COALESCE(v_payment.tus_payment_amount, v_payment.tsp_price, v_payment.tp_amount, 0), v_percent, 0, v_required_directs, v_direct_count, 'skipped', 'working_5x_limit_reached', v_recipient_subscription_id)
      ON CONFLICT (tjc_payment_id, tjc_level, tjc_recipient_user_id) DO NOTHING;
      v_skipped_count := v_skipped_count + 1;
      CONTINUE;
    END IF;

    INSERT INTO public.tbl_joining_commissions (tjc_payment_id, tjc_subscription_id, tjc_joined_user_id, tjc_recipient_user_id, tjc_level, tjc_plan_amount, tjc_percentage, tjc_commission_amount, tjc_required_direct_joins, tjc_direct_joins_at_award, tjc_status, tjc_recipient_subscription_id)
    VALUES (p_payment_id, v_payment.tp_subscription_id, v_payment.tp_user_id, v_recipient_id, v_level, COALESCE(v_payment.tus_payment_amount, v_payment.tsp_price, v_payment.tp_amount, 0), v_percent, v_amount, v_required_directs, v_direct_count, 'credited', v_recipient_subscription_id)
    ON CONFLICT (tjc_payment_id, tjc_level, tjc_recipient_user_id) DO NOTHING
    RETURNING tjc_id INTO v_commission_id;
    IF v_commission_id IS NULL THEN CONTINUE; END IF;

    v_wallet_id := public.ensure_working_wallet(v_recipient_id);
    INSERT INTO public.tbl_wallet_transactions (twt_wallet_id, twt_user_id, twt_transaction_type, twt_amount, twt_description, twt_status, twt_reference_type, twt_reference_id, twt_created_at)
    VALUES (v_wallet_id, v_recipient_id, 'credit', v_amount, 'Level ' || v_level || ' joining commission from ' || v_joined_label, 'completed', 'joining_commission', v_commission_id, now())
    RETURNING twt_id INTO v_wallet_tx_id;
    UPDATE public.tbl_wallets SET tw_balance = COALESCE(tw_balance, 0) + v_amount, tw_updated_at = now() WHERE tw_id = v_wallet_id;
    UPDATE public.tbl_joining_commissions
    SET tjc_wallet_transaction_id = v_wallet_tx_id
    WHERE tjc_id = v_commission_id;
    PERFORM public.mark_subscription_exhausted_if_needed(v_recipient_subscription_id);
    v_credited_total := v_credited_total + v_amount;
    v_credit_count := v_credit_count + 1;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'payment_id', p_payment_id, 'credited_count', v_credit_count, 'locked_count', v_locked_count, 'skipped_count', v_skipped_count, 'credited_total', v_credited_total);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_user_active_working_income_subscription(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_valid_working_income_customer(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_valid_roi_direct_customer(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_roi_level_cap(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_active_earning_subscription_for_roi_level(uuid, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.award_launch_joining_commissions_for_payment(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_active_working_income_subscription(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_valid_working_income_customer(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_valid_roi_direct_customer(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_user_roi_level_cap(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_user_active_earning_subscription_for_roi_level(uuid, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.award_launch_joining_commissions_for_payment(uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
