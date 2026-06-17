-- Enforce per-package income exhaustion.
-- A launch subscription/package is exhausted as soon as either limit is met:
--   - non-working income reaches 2x the package amount
--   - working income reaches 5x the package amount
-- Exhausted packages cannot earn further income and do not qualify as parent
-- packages for direct/ROI eligibility until the user renews with a new package.

ALTER TABLE public.tbl_user_subscriptions
  ADD COLUMN IF NOT EXISTS tus_exhausted_at timestamptz;

ALTER TABLE public.tbl_user_subscriptions
  ADD COLUMN IF NOT EXISTS tus_exhaustion_reason text;

ALTER TABLE public.tbl_user_subscriptions
  DROP CONSTRAINT IF EXISTS tbl_user_subscriptions_tus_status_check;

ALTER TABLE public.tbl_user_subscriptions
  ADD CONSTRAINT tbl_user_subscriptions_tus_status_check
  CHECK (tus_status IN ('active', 'inactive', 'expired', 'cancelled', 'upgraded', 'exhausted'));

ALTER TABLE public.tbl_joining_commissions
  ADD COLUMN IF NOT EXISTS tjc_recipient_subscription_id uuid
  REFERENCES public.tbl_user_subscriptions(tus_id) ON DELETE SET NULL;

ALTER TABLE public.tbl_roi_level_incomes
  ADD COLUMN IF NOT EXISTS trli_recipient_subscription_id uuid
  REFERENCES public.tbl_user_subscriptions(tus_id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_joining_commissions_recipient_subscription
  ON public.tbl_joining_commissions(tjc_recipient_subscription_id)
  WHERE tjc_recipient_subscription_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_roi_level_incomes_recipient_subscription
  ON public.tbl_roi_level_incomes(trli_recipient_subscription_id)
  WHERE trli_recipient_subscription_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_subscriptions_active_exhaustion
  ON public.tbl_user_subscriptions(tus_user_id, tus_status, tus_exhausted_at, tus_start_date DESC);

CREATE OR REPLACE FUNCTION public.get_subscription_plan_amount(p_subscription_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ROUND(
    GREATEST(
      COALESCE(us.tus_payment_amount, 0),
      COALESCE(sp.tsp_price, 0)
    )::numeric,
    6
  )
  FROM public.tbl_user_subscriptions us
  JOIN public.tbl_subscription_plans sp ON sp.tsp_id = us.tus_plan_id
  WHERE us.tus_id = p_subscription_id;
$$;

CREATE OR REPLACE FUNCTION public.get_subscription_non_working_paid(p_subscription_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(tx.twt_amount), 0)::numeric
  FROM public.tbl_wallet_transactions tx
  JOIN public.tbl_user_reward_coupons rc
    ON rc.turc_id = tx.twt_reference_id
  WHERE tx.twt_reference_type = 'reward_coupon'
    AND tx.twt_status = 'completed'
    AND tx.twt_transaction_type = 'credit'
    AND rc.turc_subscription_id = p_subscription_id;
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
  )::numeric;
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
  v_day_number integer := NULL;
  v_reason text := NULL;
BEGIN
  IF p_subscription_id IS NULL OR v_plan_amount <= 0 THEN
    RETURN jsonb_build_object('exhausted', false, 'reason', 'invalid_subscription');
  END IF;

  SELECT ((CURRENT_DATE - COALESCE(us.tus_start_date::date, CURRENT_DATE)) + 1)::integer
  INTO v_day_number
  FROM public.tbl_user_subscriptions us
  WHERE us.tus_id = p_subscription_id;

  IF v_non_working_paid >= (v_plan_amount * 2) THEN
    v_reason := 'non_working_2x_limit_reached';
  ELSIF COALESCE(v_day_number, 1) > 200 THEN
    v_reason := 'non_working_200_day_window_completed';
  ELSIF v_working_paid >= (v_plan_amount * 5) THEN
    v_reason := 'working_5x_limit_reached';
  END IF;

  IF v_reason IS NOT NULL THEN
    UPDATE public.tbl_user_subscriptions
    SET
      tus_status = 'exhausted',
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
    'non_working_limit', v_plan_amount * 2,
    'working_limit', v_plan_amount * 5
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_user_active_earning_subscription(p_user_id uuid)
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
  WITH candidates AS (
    SELECT
      us.tus_id,
      public.get_subscription_plan_amount(us.tus_id) AS package_amount,
      public.get_subscription_non_working_paid(us.tus_id) AS package_non_working_paid,
      public.get_subscription_working_paid(us.tus_id) AS package_working_paid,
      GREATEST(
        1,
        LEAST(
          200,
          ((CURRENT_DATE - COALESCE(us.tus_start_date::date, CURRENT_DATE)) + 1)::integer
        )
      ) AS package_day_number,
      us.tus_start_date
    FROM public.tbl_user_subscriptions us
    JOIN public.tbl_subscription_plans sp ON sp.tsp_id = us.tus_plan_id
    WHERE us.tus_user_id = p_user_id
      AND us.tus_status IN ('active', 'upgraded')
      AND us.tus_exhausted_at IS NULL
      AND (us.tus_end_date IS NULL OR us.tus_end_date > now())
      AND COALESCE(us.tus_plan_phase, sp.tsp_plan_phase, 'prelaunch') = 'launch'
      AND ((CURRENT_DATE - COALESCE(us.tus_start_date::date, CURRENT_DATE)) + 1) <= 200
  )
  SELECT
    c.tus_id AS subscription_id,
    c.package_amount AS plan_amount,
    c.package_non_working_paid AS non_working_paid,
    c.package_working_paid AS working_paid,
    GREATEST(0, (c.package_amount * 2) - c.package_non_working_paid) AS non_working_remaining,
    GREATEST(0, (c.package_amount * 5) - c.package_working_paid) AS working_remaining,
    c.package_day_number AS day_number
  FROM candidates c
  WHERE c.package_amount > 0
    AND c.package_non_working_paid < (c.package_amount * 2)
    AND c.package_working_paid < (c.package_amount * 5)
  ORDER BY c.tus_start_date ASC NULLS LAST, c.package_amount DESC
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.user_has_active_earning_package(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.get_user_active_earning_subscription(p_user_id)
  );
$$;

CREATE OR REPLACE FUNCTION public.cap_subscription_non_working_credit(
  p_subscription_id uuid,
  p_requested_amount numeric
)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_subscription record;
  v_plan_amount numeric := COALESCE(public.get_subscription_plan_amount(p_subscription_id), 0);
  v_non_working_paid numeric := COALESCE(public.get_subscription_non_working_paid(p_subscription_id), 0);
  v_working_paid numeric := COALESCE(public.get_subscription_working_paid(p_subscription_id), 0);
  v_day_number integer := 1;
BEGIN
  SELECT
    us.tus_status,
    us.tus_exhausted_at,
    us.tus_end_date,
    ((CURRENT_DATE - COALESCE(us.tus_start_date::date, CURRENT_DATE)) + 1)::integer AS day_number
  INTO v_subscription
  FROM public.tbl_user_subscriptions us
  WHERE us.tus_id = p_subscription_id;

  IF NOT FOUND
     OR v_plan_amount <= 0
     OR v_subscription.tus_status NOT IN ('active', 'upgraded')
     OR v_subscription.tus_exhausted_at IS NOT NULL
     OR (v_subscription.tus_end_date IS NOT NULL AND v_subscription.tus_end_date <= now()) THEN
    RETURN 0;
  END IF;

  v_day_number := COALESCE(v_subscription.day_number, 1);

  IF v_day_number > 200
     OR v_non_working_paid >= (v_plan_amount * 2)
     OR v_working_paid >= (v_plan_amount * 5) THEN
    RETURN 0;
  END IF;

  RETURN ROUND(
    LEAST(
      GREATEST(COALESCE(p_requested_amount, 0), 0),
      GREATEST(0, (v_plan_amount * 2) - v_non_working_paid)
    )::numeric,
    6
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.cap_subscription_working_credit(
  p_subscription_id uuid,
  p_requested_amount numeric
)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_subscription record;
  v_plan_amount numeric := COALESCE(public.get_subscription_plan_amount(p_subscription_id), 0);
  v_non_working_paid numeric := COALESCE(public.get_subscription_non_working_paid(p_subscription_id), 0);
  v_working_paid numeric := COALESCE(public.get_subscription_working_paid(p_subscription_id), 0);
  v_day_number integer := 1;
BEGIN
  SELECT
    us.tus_status,
    us.tus_exhausted_at,
    us.tus_end_date,
    ((CURRENT_DATE - COALESCE(us.tus_start_date::date, CURRENT_DATE)) + 1)::integer AS day_number
  INTO v_subscription
  FROM public.tbl_user_subscriptions us
  WHERE us.tus_id = p_subscription_id;

  IF NOT FOUND
     OR v_plan_amount <= 0
     OR v_subscription.tus_status NOT IN ('active', 'upgraded')
     OR v_subscription.tus_exhausted_at IS NOT NULL
     OR (v_subscription.tus_end_date IS NOT NULL AND v_subscription.tus_end_date <= now()) THEN
    RETURN 0;
  END IF;

  v_day_number := COALESCE(v_subscription.day_number, 1);

  IF v_day_number > 200
     OR v_non_working_paid >= (v_plan_amount * 2)
     OR v_working_paid >= (v_plan_amount * 5) THEN
    RETURN 0;
  END IF;

  RETURN ROUND(
    LEAST(
      GREATEST(COALESCE(p_requested_amount, 0), 0),
      GREATEST(0, (v_plan_amount * 5) - v_working_paid)
    )::numeric,
    6
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_subscription_plan_amount(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_subscription_non_working_paid(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_subscription_working_paid(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mark_subscription_exhausted_if_needed(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_active_earning_subscription(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.user_has_active_earning_package(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cap_subscription_non_working_credit(uuid, numeric) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cap_subscription_working_credit(uuid, numeric) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_subscription_plan_amount(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_subscription_non_working_paid(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_subscription_working_paid(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_subscription_exhausted_if_needed(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_user_active_earning_subscription(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_has_active_earning_package(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cap_subscription_non_working_credit(uuid, numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.cap_subscription_working_credit(uuid, numeric) TO service_role;

CREATE OR REPLACE FUNCTION public.is_valid_roi_active_customer(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $roi_active_earning_customer$
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
$roi_active_earning_customer$;

CREATE OR REPLACE FUNCTION public.is_valid_roi_direct_customer(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $valid_roi_active_direct_customer$
  SELECT public.is_valid_roi_active_customer(p_user_id);
$valid_roi_active_direct_customer$;

CREATE OR REPLACE FUNCTION public.count_paid_direct_joins(p_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $roi_active_package_direct_count$
  WITH parent_profile AS (
    SELECT MAX(public.normalize_sponsorship_key(tup_sponsorship_number)) AS sponsorship_key
    FROM public.tbl_user_profiles
    WHERE tup_user_id = p_user_id
  )
  SELECT COALESCE(COUNT(DISTINCT child.tu_id), 0)::integer
  FROM public.tbl_users child
  LEFT JOIN public.tbl_user_profiles child_profile ON child_profile.tup_user_id = child.tu_id
  CROSS JOIN parent_profile parent
  WHERE public.is_valid_roi_direct_customer(child.tu_id)
    AND (
      child.tu_referrer_id = p_user_id
      OR (
        parent.sponsorship_key IS NOT NULL
        AND public.normalize_sponsorship_key(child_profile.tup_parent_account) = parent.sponsorship_key
      )
    );
$roi_active_package_direct_count$;

CREATE OR REPLACE FUNCTION public.get_user_roi_level_cap(p_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $roi_active_package_level_cap$
  WITH active_launch_plans AS (
    SELECT public.get_subscription_plan_amount(us.tus_id) AS plan_amount
    FROM public.tbl_user_subscriptions us
    JOIN public.tbl_subscription_plans sp ON sp.tsp_id = us.tus_plan_id
    WHERE us.tus_user_id = p_user_id
      AND us.tus_status IN ('active', 'upgraded')
      AND us.tus_exhausted_at IS NULL
      AND (us.tus_end_date IS NULL OR us.tus_end_date > now())
      AND COALESCE(us.tus_plan_phase, sp.tsp_plan_phase, 'prelaunch') = 'launch'
      AND ((CURRENT_DATE - COALESCE(us.tus_start_date::date, CURRENT_DATE)) + 1) <= 200
      AND public.get_subscription_non_working_paid(us.tus_id) < (public.get_subscription_plan_amount(us.tus_id) * 2)
      AND public.get_subscription_working_paid(us.tus_id) < (public.get_subscription_plan_amount(us.tus_id) * 5)
  )
  SELECT CASE
    WHEN COALESCE(MAX(plan_amount), 0) >= 200 THEN 15
    WHEN COALESCE(MAX(plan_amount), 0) >= 100 THEN 10
    WHEN COALESCE(MAX(plan_amount), 0) >= 50 THEN 7
    ELSE 0
  END
  FROM active_launch_plans;
$roi_active_package_level_cap$;

REVOKE EXECUTE ON FUNCTION public.is_valid_roi_active_customer(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_valid_roi_direct_customer(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.count_paid_direct_joins(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_roi_level_cap(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_valid_roi_active_customer(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_valid_roi_direct_customer(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.count_paid_direct_joins(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_user_roi_level_cap(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.user_has_active_same_plan_package(
  p_user_id uuid,
  p_plan_id uuid,
  p_exclude_subscription_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $same_active_earning_plan_package$
  WITH target_plan AS (
    SELECT
      sp.tsp_id,
      round(COALESCE(sp.tsp_price, 0)::numeric, 6) AS plan_amount,
      COALESCE(sp.tsp_plan_phase, 'prelaunch') AS plan_phase
    FROM public.tbl_subscription_plans sp
    WHERE sp.tsp_id = p_plan_id
  )
  SELECT EXISTS (
    SELECT 1
    FROM public.tbl_user_subscriptions us
    JOIN public.tbl_subscription_plans sp ON sp.tsp_id = us.tus_plan_id
    CROSS JOIN target_plan target
    WHERE us.tus_user_id = p_user_id
      AND us.tus_status IN ('active', 'upgraded')
      AND us.tus_exhausted_at IS NULL
      AND (us.tus_end_date IS NULL OR us.tus_end_date > now())
      AND ((CURRENT_DATE - COALESCE(us.tus_start_date::date, CURRENT_DATE)) + 1) <= 200
      AND public.get_subscription_non_working_paid(us.tus_id) < (public.get_subscription_plan_amount(us.tus_id) * 2)
      AND public.get_subscription_working_paid(us.tus_id) < (public.get_subscription_plan_amount(us.tus_id) * 5)
      AND (p_exclude_subscription_id IS NULL OR us.tus_id <> p_exclude_subscription_id)
      AND (
        us.tus_plan_id = target.tsp_id
        OR (
          COALESCE(us.tus_plan_phase, sp.tsp_plan_phase, 'prelaunch') = target.plan_phase
          AND round(COALESCE(us.tus_payment_amount, sp.tsp_price, 0)::numeric, 6) = target.plan_amount
        )
      )
  );
$same_active_earning_plan_package$;

REVOKE EXECUTE ON FUNCTION public.user_has_active_same_plan_package(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_has_active_same_plan_package(uuid, uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.rate_reward_coupon(
  p_assignment_id uuid,
  p_rating integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $rate_reward_coupon_package_caps$
DECLARE
  v_user_id uuid := auth.uid();
  v_assignment record;
  v_coupon record;
  v_wallet_id uuid;
  v_transaction_id uuid;
  v_existing_reward_tx_id uuid;
  v_rating integer := COALESCE(p_rating, 0);
  v_roi_level_result jsonb := '{}'::jsonb;
  v_credit_amount numeric(18, 6);
  v_exhaustion_result jsonb := '{}'::jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF v_rating NOT BETWEEN 1 AND 5 THEN
    RAISE EXCEPTION 'Select a rating from 1 to 5 stars';
  END IF;

  SELECT * INTO v_assignment
  FROM public.tbl_user_reward_coupons
  WHERE turc_id = p_assignment_id
    AND turc_user_id = v_user_id
  FOR UPDATE;

  IF v_assignment.turc_id IS NULL THEN
    RAISE EXCEPTION 'Coupon assignment not found';
  END IF;

  IF v_assignment.turc_status IN ('liked', 'disliked') THEN
    SELECT tx.twt_id
    INTO v_existing_reward_tx_id
    FROM public.tbl_wallet_transactions tx
    WHERE tx.twt_reference_type = 'reward_coupon'
      AND tx.twt_reference_id = p_assignment_id
      AND tx.twt_status = 'completed'
    ORDER BY tx.twt_created_at ASC
    LIMIT 1;

    IF v_existing_reward_tx_id IS NOT NULL THEN
      v_roi_level_result := public.award_roi_level_income_for_reward_coupon(p_assignment_id);
    END IF;

    RETURN jsonb_build_object(
      'status', v_assignment.turc_status,
      'reaction', v_assignment.turc_reaction,
      'rating', v_assignment.turc_rating,
      'reacted_at', v_assignment.turc_reacted_at,
      'reward_credited', false,
      'reward_amount', v_assignment.turc_reward_amount,
      'roi_level_income', v_roi_level_result
    );
  END IF;

  IF v_assignment.turc_status <> 'opened' THEN
    RAISE EXCEPTION 'Open this coupon before rating it';
  END IF;

  IF v_assignment.turc_reaction IS NULL THEN
    RAISE EXCEPTION 'Choose like or dislike before rating this coupon';
  END IF;

  IF v_assignment.turc_site_visited_at IS NULL THEN
    RAISE EXCEPTION 'Visit the coupon site before submitting a rating';
  END IF;

  IF now() < v_assignment.turc_site_visited_at + interval '5 seconds' THEN
    RAISE EXCEPTION 'Please wait 5 seconds after visiting the site';
  END IF;

  v_credit_amount := public.cap_subscription_non_working_credit(
    v_assignment.turc_subscription_id,
    v_assignment.turc_reward_amount
  );

  IF v_credit_amount <= 0 THEN
    UPDATE public.tbl_user_reward_coupons
    SET
      turc_status = v_assignment.turc_reaction,
      turc_rating = v_rating,
      turc_reward_amount = 0,
      turc_reacted_at = now()
    WHERE turc_id = p_assignment_id
    RETURNING * INTO v_assignment;

    v_exhaustion_result := public.mark_subscription_exhausted_if_needed(v_assignment.turc_subscription_id);

    RETURN jsonb_build_object(
      'status', v_assignment.turc_status,
      'reaction', v_assignment.turc_reaction,
      'rating', v_assignment.turc_rating,
      'reacted_at', v_assignment.turc_reacted_at,
      'reward_credited', false,
      'reward_amount', 0,
      'package_exhaustion', v_exhaustion_result,
      'roi_level_income', v_roi_level_result
    );
  END IF;

  SELECT * INTO v_coupon
  FROM public.tbl_coupons
  WHERE tc_id = v_assignment.turc_coupon_id;

  v_wallet_id := public.ensure_reward_wallet(v_user_id);

  PERFORM 1
  FROM public.tbl_wallets
  WHERE tw_id = v_wallet_id
  FOR UPDATE;

  UPDATE public.tbl_user_reward_coupons
  SET turc_reward_amount = v_credit_amount
  WHERE turc_id = p_assignment_id
  RETURNING * INTO v_assignment;

  INSERT INTO public.tbl_wallet_transactions (
    twt_wallet_id,
    twt_user_id,
    twt_transaction_type,
    twt_amount,
    twt_currency,
    twt_description,
    twt_reference_type,
    twt_reference_id,
    twt_status
  )
  VALUES (
    v_wallet_id,
    v_user_id,
    'credit',
    v_credit_amount,
    'USDT',
    'Daily reward coupon completed: ' || COALESCE(v_coupon.tc_title, 'Coupon'),
    'reward_coupon',
    p_assignment_id,
    'completed'
  )
  ON CONFLICT DO NOTHING
  RETURNING twt_id INTO v_transaction_id;

  IF v_transaction_id IS NOT NULL THEN
    UPDATE public.tbl_wallets
    SET
      tw_balance = COALESCE(tw_balance, 0) + v_credit_amount,
      tw_updated_at = now()
    WHERE tw_id = v_wallet_id;
  END IF;

  UPDATE public.tbl_user_reward_coupons
  SET
    turc_status = v_assignment.turc_reaction,
    turc_rating = v_rating,
    turc_reacted_at = now()
  WHERE turc_id = p_assignment_id
  RETURNING * INTO v_assignment;

  IF v_transaction_id IS NOT NULL THEN
    v_exhaustion_result := public.mark_subscription_exhausted_if_needed(v_assignment.turc_subscription_id);
    v_roi_level_result := public.award_roi_level_income_for_reward_coupon(p_assignment_id);
  ELSE
    SELECT tx.twt_id
    INTO v_existing_reward_tx_id
    FROM public.tbl_wallet_transactions tx
    WHERE tx.twt_reference_type = 'reward_coupon'
      AND tx.twt_reference_id = p_assignment_id
      AND tx.twt_status = 'completed'
    ORDER BY tx.twt_created_at ASC
    LIMIT 1;

    IF v_existing_reward_tx_id IS NOT NULL THEN
      v_exhaustion_result := public.mark_subscription_exhausted_if_needed(v_assignment.turc_subscription_id);
      v_roi_level_result := public.award_roi_level_income_for_reward_coupon(p_assignment_id);
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'status', v_assignment.turc_status,
    'reaction', v_assignment.turc_reaction,
    'rating', v_assignment.turc_rating,
    'reacted_at', v_assignment.turc_reacted_at,
    'reward_credited', v_transaction_id IS NOT NULL,
    'reward_amount', v_credit_amount,
    'package_exhaustion', v_exhaustion_result,
    'roi_level_income', v_roi_level_result
  );
END;
$rate_reward_coupon_package_caps$;

REVOKE EXECUTE ON FUNCTION public.rate_reward_coupon(uuid, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rate_reward_coupon(uuid, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.rate_reward_coupon(uuid, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.award_launch_joining_commissions_for_payment(p_payment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $award_joining_commissions_package_caps$
DECLARE
  v_payment record;
  v_plan_amount numeric(18, 6);
  v_joined_user_id uuid;
  v_subscription_id uuid;
  v_joined_label text;
  v_level integer;
  v_recipient_id uuid;
  v_required_directs integer;
  v_percent numeric(9, 6);
  v_direct_count integer;
  v_requested_amount numeric(18, 6);
  v_amount numeric(18, 6);
  v_wallet_id uuid;
  v_commission_id uuid;
  v_wallet_tx_id uuid;
  v_recipient_subscription_id uuid;
  v_credited_total numeric(18, 6) := 0;
  v_credit_count integer := 0;
  v_locked_count integer := 0;
  v_skipped_count integer := 0;
BEGIN
  SELECT
    p.tp_id,
    p.tp_user_id,
    p.tp_subscription_id,
    p.tp_payment_status,
    p.tp_amount,
    us.tus_id,
    us.tus_user_id,
    us.tus_payment_amount,
    COALESCE(us.tus_plan_phase, sp.tsp_plan_phase, 'prelaunch') AS plan_phase,
    sp.tsp_price,
    up.tup_sponsorship_number,
    up.tup_first_name,
    up.tup_last_name,
    u.tu_email
  INTO v_payment
  FROM public.tbl_payments p
  JOIN public.tbl_user_subscriptions us ON us.tus_id = p.tp_subscription_id
  JOIN public.tbl_subscription_plans sp ON sp.tsp_id = us.tus_plan_id
  JOIN public.tbl_users u ON u.tu_id = p.tp_user_id
  LEFT JOIN public.tbl_user_profiles up ON up.tup_user_id = p.tp_user_id
  WHERE p.tp_id = p_payment_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'payment_not_found');
  END IF;

  IF v_payment.tp_payment_status <> 'completed' THEN
    RETURN jsonb_build_object('success', false, 'reason', 'payment_not_completed');
  END IF;

  IF v_payment.plan_phase <> 'launch' THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_launch_plan');
  END IF;

  v_joined_user_id := v_payment.tp_user_id;
  v_subscription_id := v_payment.tp_subscription_id;
  v_plan_amount := ROUND(COALESCE(v_payment.tus_payment_amount, v_payment.tsp_price, v_payment.tp_amount, 0)::numeric, 6);

  IF v_plan_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'reason', 'invalid_plan_amount');
  END IF;

  v_joined_label := COALESCE(
    NULLIF(trim(v_payment.tup_sponsorship_number), ''),
    NULLIF(trim(concat_ws(' ', v_payment.tup_first_name, v_payment.tup_last_name)), ''),
    NULLIF(trim(v_payment.tu_email), ''),
    v_joined_user_id::text
  );

  FOR v_level, v_recipient_id, v_percent, v_required_directs IN
    WITH RECURSIVE uplines AS (
      SELECT
        1 AS level,
        parent.tu_id AS recipient_user_id
      FROM public.tbl_users joined
      JOIN public.tbl_users parent ON parent.tu_id = joined.tu_referrer_id
      WHERE joined.tu_id = v_joined_user_id

      UNION ALL

      SELECT
        u.level + 1,
        parent.tu_id
      FROM uplines u
      JOIN public.tbl_users upline_user ON upline_user.tu_id = u.recipient_user_id
      JOIN public.tbl_users parent ON parent.tu_id = upline_user.tu_referrer_id
      WHERE u.level < 3
    )
    SELECT
      u.level,
      u.recipient_user_id,
      CASE u.level
        WHEN 1 THEN 7.0
        WHEN 2 THEN 1.5
        WHEN 3 THEN 1.0
      END::numeric(9, 6) AS percent,
      CASE u.level
        WHEN 1 THEN 0
        WHEN 2 THEN 3
        WHEN 3 THEN 9
      END AS required_directs
    FROM uplines u
    ORDER BY u.level
  LOOP
    v_commission_id := NULL;
    v_wallet_tx_id := NULL;
    v_recipient_subscription_id := NULL;
    v_direct_count := public.count_paid_direct_joins(v_recipient_id);
    v_requested_amount := ROUND((v_plan_amount * v_percent / 100)::numeric, 6);
    v_amount := v_requested_amount;

    SELECT earning.subscription_id
    INTO v_recipient_subscription_id
    FROM public.get_user_active_earning_subscription(v_recipient_id) earning
    LIMIT 1;

    IF v_recipient_subscription_id IS NULL OR NOT public.is_valid_roi_active_customer(v_recipient_id) THEN
      INSERT INTO public.tbl_joining_commissions (
        tjc_payment_id,
        tjc_subscription_id,
        tjc_joined_user_id,
        tjc_recipient_user_id,
        tjc_level,
        tjc_plan_amount,
        tjc_percentage,
        tjc_commission_amount,
        tjc_required_direct_joins,
        tjc_direct_joins_at_award,
        tjc_status,
        tjc_skip_reason,
        tjc_recipient_subscription_id
      ) VALUES (
        p_payment_id,
        v_subscription_id,
        v_joined_user_id,
        v_recipient_id,
        v_level,
        v_plan_amount,
        v_percent,
        v_requested_amount,
        v_required_directs,
        v_direct_count,
        'locked',
        'no_active_earning_package',
        v_recipient_subscription_id
      )
      ON CONFLICT (tjc_payment_id, tjc_level, tjc_recipient_user_id) DO NOTHING;

      v_locked_count := v_locked_count + 1;
      CONTINUE;
    END IF;

    IF v_direct_count < v_required_directs THEN
      INSERT INTO public.tbl_joining_commissions (
        tjc_payment_id,
        tjc_subscription_id,
        tjc_joined_user_id,
        tjc_recipient_user_id,
        tjc_level,
        tjc_plan_amount,
        tjc_percentage,
        tjc_commission_amount,
        tjc_required_direct_joins,
        tjc_direct_joins_at_award,
        tjc_status,
        tjc_skip_reason,
        tjc_recipient_subscription_id
      ) VALUES (
        p_payment_id,
        v_subscription_id,
        v_joined_user_id,
        v_recipient_id,
        v_level,
        v_plan_amount,
        v_percent,
        v_requested_amount,
        v_required_directs,
        v_direct_count,
        'locked',
        'direct_join_requirement_not_met',
        v_recipient_subscription_id
      )
      ON CONFLICT (tjc_payment_id, tjc_level, tjc_recipient_user_id) DO NOTHING;

      v_locked_count := v_locked_count + 1;
      CONTINUE;
    END IF;

    v_amount := public.cap_subscription_working_credit(v_recipient_subscription_id, v_requested_amount);

    IF v_amount <= 0 THEN
      PERFORM public.mark_subscription_exhausted_if_needed(v_recipient_subscription_id);

      INSERT INTO public.tbl_joining_commissions (
        tjc_payment_id,
        tjc_subscription_id,
        tjc_joined_user_id,
        tjc_recipient_user_id,
        tjc_level,
        tjc_plan_amount,
        tjc_percentage,
        tjc_commission_amount,
        tjc_required_direct_joins,
        tjc_direct_joins_at_award,
        tjc_status,
        tjc_skip_reason,
        tjc_recipient_subscription_id
      ) VALUES (
        p_payment_id,
        v_subscription_id,
        v_joined_user_id,
        v_recipient_id,
        v_level,
        v_plan_amount,
        v_percent,
        0,
        v_required_directs,
        v_direct_count,
        'skipped',
        'working_5x_limit_reached',
        v_recipient_subscription_id
      )
      ON CONFLICT (tjc_payment_id, tjc_level, tjc_recipient_user_id) DO NOTHING;

      v_skipped_count := v_skipped_count + 1;
      CONTINUE;
    END IF;

    INSERT INTO public.tbl_joining_commissions (
      tjc_payment_id,
      tjc_subscription_id,
      tjc_joined_user_id,
      tjc_recipient_user_id,
      tjc_level,
      tjc_plan_amount,
      tjc_percentage,
      tjc_commission_amount,
      tjc_required_direct_joins,
      tjc_direct_joins_at_award,
      tjc_status,
      tjc_recipient_subscription_id
    ) VALUES (
      p_payment_id,
      v_subscription_id,
      v_joined_user_id,
      v_recipient_id,
      v_level,
      v_plan_amount,
      v_percent,
      v_amount,
      v_required_directs,
      v_direct_count,
      'credited',
      v_recipient_subscription_id
    )
    ON CONFLICT (tjc_payment_id, tjc_level, tjc_recipient_user_id) DO NOTHING
    RETURNING tjc_id INTO v_commission_id;

    IF v_commission_id IS NULL THEN
      CONTINUE;
    END IF;

    v_wallet_id := public.ensure_working_wallet(v_recipient_id);

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
      v_recipient_id,
      'credit',
      v_amount,
      'Level ' || v_level || ' joining commission from ' || v_joined_label,
      'completed',
      'joining_commission',
      v_commission_id,
      now()
    )
    RETURNING twt_id INTO v_wallet_tx_id;

    UPDATE public.tbl_wallets
    SET
      tw_balance = COALESCE(tw_balance, 0) + v_amount,
      tw_updated_at = now()
    WHERE tw_id = v_wallet_id;

    UPDATE public.tbl_joining_commissions
    SET tjc_wallet_transaction_id = v_wallet_tx_id
    WHERE tjc_id = v_commission_id;

    PERFORM public.mark_subscription_exhausted_if_needed(v_recipient_subscription_id);

    v_credited_total := v_credited_total + v_amount;
    v_credit_count := v_credit_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'payment_id', p_payment_id,
    'credited_count', v_credit_count,
    'locked_count', v_locked_count,
    'skipped_count', v_skipped_count,
    'credited_total', v_credited_total
  );
END;
$award_joining_commissions_package_caps$;

REVOKE EXECUTE ON FUNCTION public.award_launch_joining_commissions_for_payment(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.award_launch_joining_commissions_for_payment(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.award_roi_level_income_for_reward_coupon(p_assignment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $award_roi_package_caps$
DECLARE
  v_assignment record;
  v_coupon record;
  v_source_label text;
  v_level integer;
  v_recipient_id uuid;
  v_percent numeric(9, 6);
  v_required_directs integer;
  v_recipient_valid boolean;
  v_direct_count integer;
  v_max_level integer;
  v_requested_amount numeric(18, 6);
  v_amount numeric(18, 6);
  v_income_id uuid;
  v_existing_wallet_tx_id uuid;
  v_wallet_id uuid;
  v_wallet_tx_id uuid;
  v_recipient_subscription_id uuid;
  v_credited_count integer := 0;
  v_locked_count integer := 0;
  v_skipped_count integer := 0;
  v_credited_total numeric(18, 6) := 0;
BEGIN
  SELECT
    rc.*,
    up.tup_sponsorship_number,
    up.tup_first_name,
    up.tup_last_name,
    u.tu_email
  INTO v_assignment
  FROM public.tbl_user_reward_coupons rc
  JOIN public.tbl_users u ON u.tu_id = rc.turc_user_id
  LEFT JOIN public.tbl_user_profiles up ON up.tup_user_id = rc.turc_user_id
  WHERE rc.turc_id = p_assignment_id;

  IF v_assignment.turc_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'assignment_not_found');
  END IF;

  IF COALESCE(v_assignment.turc_reward_amount, 0) <= 0 THEN
    RETURN jsonb_build_object('success', false, 'reason', 'empty_source_reward');
  END IF;

  SELECT * INTO v_coupon
  FROM public.tbl_coupons
  WHERE tc_id = v_assignment.turc_coupon_id;

  v_source_label := COALESCE(
    NULLIF(trim(v_assignment.tup_sponsorship_number), ''),
    NULLIF(trim(concat_ws(' ', v_assignment.tup_first_name, v_assignment.tup_last_name)), ''),
    NULLIF(trim(v_assignment.tu_email), ''),
    v_assignment.turc_user_id::text
  );

  FOR v_level, v_recipient_id, v_percent, v_required_directs, v_recipient_valid IN
    WITH RECURSIVE uplines AS (
      SELECT
        1 AS level,
        COALESCE(parent_profile.tup_user_id, parent_by_ref.tu_id) AS recipient_user_id,
        ARRAY[source_user.tu_id, COALESCE(parent_profile.tup_user_id, parent_by_ref.tu_id)]::uuid[] AS path
      FROM public.tbl_users source_user
      LEFT JOIN public.tbl_user_profiles source_profile ON source_profile.tup_user_id = source_user.tu_id
      LEFT JOIN public.tbl_users parent_by_ref ON parent_by_ref.tu_id = source_user.tu_referrer_id
      LEFT JOIN public.tbl_user_profiles parent_profile
        ON public.normalize_sponsorship_key(parent_profile.tup_sponsorship_number)
         = public.normalize_sponsorship_key(source_profile.tup_parent_account)
      WHERE source_user.tu_id = v_assignment.turc_user_id
        AND COALESCE(parent_profile.tup_user_id, parent_by_ref.tu_id) IS NOT NULL

      UNION ALL

      SELECT
        u.level + 1,
        COALESCE(parent_profile.tup_user_id, parent_by_ref.tu_id),
        u.path || COALESCE(parent_profile.tup_user_id, parent_by_ref.tu_id)
      FROM uplines u
      JOIN public.tbl_users upline_user ON upline_user.tu_id = u.recipient_user_id
      LEFT JOIN public.tbl_user_profiles upline_profile ON upline_profile.tup_user_id = upline_user.tu_id
      LEFT JOIN public.tbl_users parent_by_ref ON parent_by_ref.tu_id = upline_user.tu_referrer_id
      LEFT JOIN public.tbl_user_profiles parent_profile
        ON public.normalize_sponsorship_key(parent_profile.tup_sponsorship_number)
         = public.normalize_sponsorship_key(upline_profile.tup_parent_account)
      WHERE u.level < 15
        AND COALESCE(parent_profile.tup_user_id, parent_by_ref.tu_id) IS NOT NULL
        AND COALESCE(parent_profile.tup_user_id, parent_by_ref.tu_id) <> ALL(u.path)
    ),
    deduped_uplines AS (
      SELECT DISTINCT ON (recipient_user_id)
        level,
        recipient_user_id
      FROM uplines
      ORDER BY recipient_user_id, level
    )
    SELECT
      u.level,
      u.recipient_user_id,
      CASE
        WHEN u.level = 1 THEN 10
        WHEN u.level = 2 THEN 5
        WHEN u.level = 3 THEN 3
        WHEN u.level = 4 THEN 2
        WHEN u.level BETWEEN 5 AND 9 THEN 1
        WHEN u.level = 10 THEN 2
        WHEN u.level IN (11, 12) THEN 1
        WHEN u.level BETWEEN 13 AND 15 THEN 2
      END::numeric(9, 6) AS percent,
      LEAST(u.level, 9)::integer AS required_directs,
      public.is_valid_roi_active_customer(u.recipient_user_id) AS recipient_valid
    FROM deduped_uplines u
    WHERE u.recipient_user_id <> v_assignment.turc_user_id
    ORDER BY u.level
  LOOP
    v_income_id := NULL;
    v_existing_wallet_tx_id := NULL;
    v_wallet_tx_id := NULL;
    v_recipient_subscription_id := NULL;
    v_direct_count := public.count_paid_direct_joins(v_recipient_id);
    v_max_level := public.get_user_roi_level_cap(v_recipient_id);
    v_requested_amount := ROUND((v_assignment.turc_reward_amount * v_percent / 100)::numeric, 6);
    v_amount := v_requested_amount;

    SELECT earning.subscription_id
    INTO v_recipient_subscription_id
    FROM public.get_user_active_earning_subscription(v_recipient_id) earning
    LIMIT 1;

    IF COALESCE(v_recipient_valid, false) = false OR v_recipient_subscription_id IS NULL THEN
      INSERT INTO public.tbl_roi_level_incomes (
        trli_assignment_id,
        trli_source_user_id,
        trli_recipient_user_id,
        trli_level,
        trli_source_reward_amount,
        trli_percentage,
        trli_income_amount,
        trli_required_directs,
        trli_directs_at_award,
        trli_max_eligible_level,
        trli_status,
        trli_skip_reason,
        trli_recipient_subscription_id
      ) VALUES (
        p_assignment_id,
        v_assignment.turc_user_id,
        v_recipient_id,
        v_level,
        v_assignment.turc_reward_amount,
        v_percent,
        v_requested_amount,
        v_required_directs,
        v_direct_count,
        v_max_level,
        'locked',
        'no_active_earning_package',
        v_recipient_subscription_id
      )
      ON CONFLICT (trli_assignment_id, trli_level, trli_recipient_user_id) DO UPDATE
      SET
        trli_source_reward_amount = EXCLUDED.trli_source_reward_amount,
        trli_percentage = EXCLUDED.trli_percentage,
        trli_income_amount = EXCLUDED.trli_income_amount,
        trli_required_directs = EXCLUDED.trli_required_directs,
        trli_directs_at_award = EXCLUDED.trli_directs_at_award,
        trli_max_eligible_level = EXCLUDED.trli_max_eligible_level,
        trli_status = EXCLUDED.trli_status,
        trli_skip_reason = EXCLUDED.trli_skip_reason,
        trli_recipient_subscription_id = EXCLUDED.trli_recipient_subscription_id
      WHERE public.tbl_roi_level_incomes.trli_status <> 'credited';

      v_locked_count := v_locked_count + 1;
      CONTINUE;
    END IF;

    IF v_requested_amount <= 0 THEN
      INSERT INTO public.tbl_roi_level_incomes (
        trli_assignment_id,
        trli_source_user_id,
        trli_recipient_user_id,
        trli_level,
        trli_source_reward_amount,
        trli_percentage,
        trli_income_amount,
        trli_required_directs,
        trli_directs_at_award,
        trli_max_eligible_level,
        trli_status,
        trli_skip_reason,
        trli_recipient_subscription_id
      ) VALUES (
        p_assignment_id,
        v_assignment.turc_user_id,
        v_recipient_id,
        v_level,
        v_assignment.turc_reward_amount,
        v_percent,
        0,
        v_required_directs,
        v_direct_count,
        v_max_level,
        'skipped',
        'zero_income_amount',
        v_recipient_subscription_id
      )
      ON CONFLICT (trli_assignment_id, trli_level, trli_recipient_user_id) DO NOTHING;

      v_skipped_count := v_skipped_count + 1;
      CONTINUE;
    END IF;

    IF v_max_level < v_level THEN
      INSERT INTO public.tbl_roi_level_incomes (
        trli_assignment_id,
        trli_source_user_id,
        trli_recipient_user_id,
        trli_level,
        trli_source_reward_amount,
        trli_percentage,
        trli_income_amount,
        trli_required_directs,
        trli_directs_at_award,
        trli_max_eligible_level,
        trli_status,
        trli_skip_reason,
        trli_recipient_subscription_id
      ) VALUES (
        p_assignment_id,
        v_assignment.turc_user_id,
        v_recipient_id,
        v_level,
        v_assignment.turc_reward_amount,
        v_percent,
        v_requested_amount,
        v_required_directs,
        v_direct_count,
        v_max_level,
        'locked',
        'plan_level_cap_not_met',
        v_recipient_subscription_id
      )
      ON CONFLICT (trli_assignment_id, trli_level, trli_recipient_user_id) DO UPDATE
      SET
        trli_source_reward_amount = EXCLUDED.trli_source_reward_amount,
        trli_percentage = EXCLUDED.trli_percentage,
        trli_income_amount = EXCLUDED.trli_income_amount,
        trli_required_directs = EXCLUDED.trli_required_directs,
        trli_directs_at_award = EXCLUDED.trli_directs_at_award,
        trli_max_eligible_level = EXCLUDED.trli_max_eligible_level,
        trli_status = EXCLUDED.trli_status,
        trli_skip_reason = EXCLUDED.trli_skip_reason,
        trli_recipient_subscription_id = EXCLUDED.trli_recipient_subscription_id
      WHERE public.tbl_roi_level_incomes.trli_status <> 'credited';

      v_locked_count := v_locked_count + 1;
      CONTINUE;
    END IF;

    IF v_direct_count < v_required_directs THEN
      INSERT INTO public.tbl_roi_level_incomes (
        trli_assignment_id,
        trli_source_user_id,
        trli_recipient_user_id,
        trli_level,
        trli_source_reward_amount,
        trli_percentage,
        trli_income_amount,
        trli_required_directs,
        trli_directs_at_award,
        trli_max_eligible_level,
        trli_status,
        trli_skip_reason,
        trli_recipient_subscription_id
      ) VALUES (
        p_assignment_id,
        v_assignment.turc_user_id,
        v_recipient_id,
        v_level,
        v_assignment.turc_reward_amount,
        v_percent,
        v_requested_amount,
        v_required_directs,
        v_direct_count,
        v_max_level,
        'locked',
        'direct_join_requirement_not_met',
        v_recipient_subscription_id
      )
      ON CONFLICT (trli_assignment_id, trli_level, trli_recipient_user_id) DO UPDATE
      SET
        trli_source_reward_amount = EXCLUDED.trli_source_reward_amount,
        trli_percentage = EXCLUDED.trli_percentage,
        trli_income_amount = EXCLUDED.trli_income_amount,
        trli_required_directs = EXCLUDED.trli_required_directs,
        trli_directs_at_award = EXCLUDED.trli_directs_at_award,
        trli_max_eligible_level = EXCLUDED.trli_max_eligible_level,
        trli_status = EXCLUDED.trli_status,
        trli_skip_reason = EXCLUDED.trli_skip_reason,
        trli_recipient_subscription_id = EXCLUDED.trli_recipient_subscription_id
      WHERE public.tbl_roi_level_incomes.trli_status <> 'credited';

      v_locked_count := v_locked_count + 1;
      CONTINUE;
    END IF;

    v_amount := public.cap_subscription_working_credit(v_recipient_subscription_id, v_requested_amount);

    IF v_amount <= 0 THEN
      PERFORM public.mark_subscription_exhausted_if_needed(v_recipient_subscription_id);

      INSERT INTO public.tbl_roi_level_incomes (
        trli_assignment_id,
        trli_source_user_id,
        trli_recipient_user_id,
        trli_level,
        trli_source_reward_amount,
        trli_percentage,
        trli_income_amount,
        trli_required_directs,
        trli_directs_at_award,
        trli_max_eligible_level,
        trli_status,
        trli_skip_reason,
        trli_recipient_subscription_id
      ) VALUES (
        p_assignment_id,
        v_assignment.turc_user_id,
        v_recipient_id,
        v_level,
        v_assignment.turc_reward_amount,
        v_percent,
        0,
        v_required_directs,
        v_direct_count,
        v_max_level,
        'skipped',
        'working_5x_limit_reached',
        v_recipient_subscription_id
      )
      ON CONFLICT (trli_assignment_id, trli_level, trli_recipient_user_id) DO NOTHING;

      v_skipped_count := v_skipped_count + 1;
      CONTINUE;
    END IF;

    INSERT INTO public.tbl_roi_level_incomes (
      trli_assignment_id,
      trli_source_user_id,
      trli_recipient_user_id,
      trli_level,
      trli_source_reward_amount,
      trli_percentage,
      trli_income_amount,
      trli_required_directs,
      trli_directs_at_award,
      trli_max_eligible_level,
      trli_status,
      trli_skip_reason,
      trli_recipient_subscription_id
    ) VALUES (
      p_assignment_id,
      v_assignment.turc_user_id,
      v_recipient_id,
      v_level,
      v_assignment.turc_reward_amount,
      v_percent,
      v_amount,
      v_required_directs,
      v_direct_count,
      v_max_level,
      'credited',
      NULL,
      v_recipient_subscription_id
    )
    ON CONFLICT (trli_assignment_id, trli_level, trli_recipient_user_id) DO UPDATE
    SET
      trli_source_reward_amount = EXCLUDED.trli_source_reward_amount,
      trli_percentage = EXCLUDED.trli_percentage,
      trli_income_amount = EXCLUDED.trli_income_amount,
      trli_required_directs = EXCLUDED.trli_required_directs,
      trli_directs_at_award = EXCLUDED.trli_directs_at_award,
      trli_max_eligible_level = EXCLUDED.trli_max_eligible_level,
      trli_status = 'credited',
      trli_skip_reason = NULL,
      trli_recipient_subscription_id = EXCLUDED.trli_recipient_subscription_id
    WHERE public.tbl_roi_level_incomes.trli_status <> 'credited'
       OR public.tbl_roi_level_incomes.trli_wallet_transaction_id IS NULL
    RETURNING trli_id, trli_wallet_transaction_id
      INTO v_income_id, v_existing_wallet_tx_id;

    IF v_income_id IS NULL OR v_existing_wallet_tx_id IS NOT NULL THEN
      CONTINUE;
    END IF;

    v_wallet_id := public.ensure_working_wallet(v_recipient_id);

    INSERT INTO public.tbl_wallet_transactions (
      twt_wallet_id,
      twt_user_id,
      twt_transaction_type,
      twt_amount,
      twt_currency,
      twt_description,
      twt_status,
      twt_reference_type,
      twt_reference_id,
      twt_created_at
    ) VALUES (
      v_wallet_id,
      v_recipient_id,
      'credit',
      v_amount,
      'USDT',
      'Level ' || v_level || ' ROI income from ' || v_source_label || ': ' || COALESCE(v_coupon.tc_title, 'Coupon'),
      'completed',
      'roi_level_income',
      v_income_id,
      now()
    )
    RETURNING twt_id INTO v_wallet_tx_id;

    UPDATE public.tbl_wallets
    SET
      tw_balance = COALESCE(tw_balance, 0) + v_amount,
      tw_updated_at = now()
    WHERE tw_id = v_wallet_id;

    UPDATE public.tbl_roi_level_incomes
    SET trli_wallet_transaction_id = v_wallet_tx_id
    WHERE trli_id = v_income_id;

    PERFORM public.mark_subscription_exhausted_if_needed(v_recipient_subscription_id);

    v_credited_count := v_credited_count + 1;
    v_credited_total := v_credited_total + v_amount;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'assignment_id', p_assignment_id,
    'credited_count', v_credited_count,
    'locked_count', v_locked_count,
    'skipped_count', v_skipped_count,
    'credited_total', v_credited_total
  );
END;
$award_roi_package_caps$;

REVOKE EXECUTE ON FUNCTION public.award_roi_level_income_for_reward_coupon(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.award_roi_level_income_for_reward_coupon(uuid) TO service_role;

UPDATE public.tbl_joining_commissions jc
SET tjc_recipient_subscription_id = (
  SELECT earning.subscription_id
  FROM public.get_user_active_earning_subscription(jc.tjc_recipient_user_id) earning
  LIMIT 1
)
WHERE jc.tjc_status = 'credited'
  AND jc.tjc_recipient_subscription_id IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.get_user_active_earning_subscription(jc.tjc_recipient_user_id)
  );

UPDATE public.tbl_roi_level_incomes ri
SET trli_recipient_subscription_id = (
  SELECT earning.subscription_id
  FROM public.get_user_active_earning_subscription(ri.trli_recipient_user_id) earning
  LIMIT 1
)
WHERE ri.trli_status = 'credited'
  AND ri.trli_recipient_subscription_id IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.get_user_active_earning_subscription(ri.trli_recipient_user_id)
  );

DO $mark_existing_exhausted_packages$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT us.tus_id
    FROM public.tbl_user_subscriptions us
    JOIN public.tbl_subscription_plans sp ON sp.tsp_id = us.tus_plan_id
    WHERE us.tus_status IN ('active', 'upgraded')
      AND us.tus_exhausted_at IS NULL
      AND COALESCE(us.tus_plan_phase, sp.tsp_plan_phase, 'prelaunch') = 'launch'
  LOOP
    PERFORM public.mark_subscription_exhausted_if_needed(r.tus_id);
  END LOOP;
END;
$mark_existing_exhausted_packages$;
