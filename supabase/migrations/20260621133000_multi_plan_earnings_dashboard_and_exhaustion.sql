-- Multi-plan earnings dashboard and package exhaustion rules.
--
-- Exhaustion is based on either:
--   - total package income (working + non-working) reaching 5x package amount
--   - the absolute 200-day package window ending
--
-- Non-working coupon income remains limited to the daily/200-day opportunity
-- and cannot exceed 2x the package amount, but 2x non-working alone no longer
-- exhausts a package.

CREATE OR REPLACE FUNCTION public.get_subscription_day_number(p_subscription_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT GREATEST(
    1,
    ((public.shopclick_business_date() - COALESCE((us.tus_start_date AT TIME ZONE 'Asia/Kolkata')::date, public.shopclick_business_date())) + 1)::integer
  )
  FROM public.tbl_user_subscriptions us
  WHERE us.tus_id = p_subscription_id;
$$;

CREATE OR REPLACE FUNCTION public.get_subscription_total_paid(p_subscription_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ROUND(
    (
      COALESCE(public.get_subscription_non_working_paid(p_subscription_id), 0)
      + COALESCE(public.get_subscription_working_paid(p_subscription_id), 0)
    )::numeric,
    6
  );
$$;

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
      AND COALESCE(us.tus_plan_phase, sp.tsp_plan_phase, 'prelaunch') = 'launch'
      AND COALESCE(public.get_subscription_plan_amount(us.tus_id), 0) > 0
      AND COALESCE(public.get_subscription_day_number(us.tus_id), 1) <= 200
      AND COALESCE(public.get_subscription_total_paid(us.tus_id), 0) < (COALESCE(public.get_subscription_plan_amount(us.tus_id), 0) * 5)
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
  v_reason text := NULL;
BEGIN
  IF p_subscription_id IS NULL OR v_plan_amount <= 0 THEN
    RETURN jsonb_build_object('exhausted', false, 'reason', 'invalid_subscription');
  END IF;

  v_total_paid := ROUND((v_non_working_paid + v_working_paid)::numeric, 6);
  v_day_number := COALESCE(public.get_subscription_day_number(p_subscription_id), 1);

  IF v_total_paid >= (v_plan_amount * 5) THEN
    v_reason := 'total_5x_limit_reached';
  ELSIF v_day_number > 200 THEN
    v_reason := 'package_200_day_window_completed';
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
    'total_paid', v_total_paid,
    'non_working_limit', v_plan_amount * 2,
    'target_income', v_plan_amount * 5,
    'remaining_income', GREATEST(0, (v_plan_amount * 5) - v_total_paid)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_user_active_earning_subscriptions(p_user_id uuid)
RETURNS TABLE (
  subscription_id uuid,
  plan_id uuid,
  plan_amount numeric,
  start_date timestamptz,
  day_number integer,
  non_working_paid numeric,
  working_paid numeric,
  non_working_remaining numeric,
  working_remaining numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH candidates AS (
    SELECT
      us.tus_id,
      us.tus_plan_id,
      public.get_subscription_plan_amount(us.tus_id) AS package_amount,
      us.tus_start_date,
      public.get_subscription_day_number(us.tus_id) AS package_day_number,
      public.get_subscription_non_working_paid(us.tus_id) AS package_non_working_paid,
      public.get_subscription_working_paid(us.tus_id) AS package_working_paid
    FROM public.tbl_user_subscriptions us
    JOIN public.tbl_subscription_plans sp ON sp.tsp_id = us.tus_plan_id
    WHERE us.tus_user_id = p_user_id
      AND us.tus_status IN ('active', 'upgraded')
      AND us.tus_exhausted_at IS NULL
      AND (us.tus_end_date IS NULL OR us.tus_end_date > now())
      AND COALESCE(us.tus_plan_phase, sp.tsp_plan_phase, 'prelaunch') = 'launch'
  )
  SELECT
    c.tus_id AS subscription_id,
    c.tus_plan_id AS plan_id,
    c.package_amount AS plan_amount,
    c.tus_start_date AS start_date,
    c.package_day_number AS day_number,
    c.package_non_working_paid AS non_working_paid,
    c.package_working_paid AS working_paid,
    GREATEST(0, (c.package_amount * 2) - c.package_non_working_paid) AS non_working_remaining,
    GREATEST(0, (c.package_amount * 5) - (c.package_non_working_paid + c.package_working_paid)) AS working_remaining
  FROM candidates c
  WHERE c.package_amount > 0
    AND c.package_day_number <= 200
    AND (c.package_non_working_paid + c.package_working_paid) < (c.package_amount * 5)
  ORDER BY c.tus_start_date ASC NULLS LAST, c.package_amount DESC, c.tus_id;
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
  SELECT
    active.subscription_id,
    active.plan_amount,
    active.non_working_paid,
    active.working_paid,
    active.non_working_remaining,
    active.working_remaining,
    active.day_number
  FROM public.get_user_active_earning_subscriptions(p_user_id) active
  LIMIT 1;
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
  v_plan_amount numeric := COALESCE(public.get_subscription_plan_amount(p_subscription_id), 0);
  v_non_working_paid numeric := COALESCE(public.get_subscription_non_working_paid(p_subscription_id), 0);
  v_total_paid numeric := COALESCE(public.get_subscription_total_paid(p_subscription_id), 0);
BEGIN
  IF NOT public.is_subscription_earning_active(p_subscription_id) THEN
    RETURN 0;
  END IF;

  RETURN ROUND(
    LEAST(
      GREATEST(COALESCE(p_requested_amount, 0), 0),
      GREATEST(0, (v_plan_amount * 2) - v_non_working_paid),
      GREATEST(0, (v_plan_amount * 5) - v_total_paid)
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
  v_plan_amount numeric := COALESCE(public.get_subscription_plan_amount(p_subscription_id), 0);
  v_total_paid numeric := COALESCE(public.get_subscription_total_paid(p_subscription_id), 0);
BEGIN
  IF NOT public.is_subscription_earning_active(p_subscription_id) THEN
    RETURN 0;
  END IF;

  RETURN ROUND(
    LEAST(
      GREATEST(COALESCE(p_requested_amount, 0), 0),
      GREATEST(0, (v_plan_amount * 5) - v_total_paid)
    )::numeric,
    6
  );
END;
$$;

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
AS $$
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
      AND public.is_subscription_earning_active(us.tus_id)
      AND (p_exclude_subscription_id IS NULL OR us.tus_id <> p_exclude_subscription_id)
      AND (
        us.tus_plan_id = target.tsp_id
        OR (
          COALESCE(us.tus_plan_phase, sp.tsp_plan_phase, 'prelaunch') = target.plan_phase
          AND round(COALESCE(us.tus_payment_amount, sp.tsp_price, 0)::numeric, 6) = target.plan_amount
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.user_has_higher_active_earning_package(
  p_user_id uuid,
  p_plan_id uuid,
  p_exclude_subscription_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH target_plan AS (
    SELECT
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
      AND public.is_subscription_earning_active(us.tus_id)
      AND (p_exclude_subscription_id IS NULL OR us.tus_id <> p_exclude_subscription_id)
      AND COALESCE(us.tus_plan_phase, sp.tsp_plan_phase, 'prelaunch') = target.plan_phase
      AND round(COALESCE(us.tus_payment_amount, sp.tsp_price, 0)::numeric, 6) > target.plan_amount
  );
$$;

CREATE OR REPLACE FUNCTION public.enforce_active_plan_purchase_hierarchy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan_phase text;
BEGIN
  IF NEW.tus_status NOT IN ('active', 'upgraded') OR NEW.tus_exhausted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(sp.tsp_plan_phase, NEW.tus_plan_phase, 'prelaunch')
  INTO v_plan_phase
  FROM public.tbl_subscription_plans sp
  WHERE sp.tsp_id = NEW.tus_plan_id;

  IF v_plan_phase <> 'launch' THEN
    RETURN NEW;
  END IF;

  UPDATE public.tbl_user_subscriptions existing_subscription
  SET
    tus_status = 'exhausted',
    tus_exhausted_at = COALESCE(tus_exhausted_at, now()),
    tus_exhaustion_reason = COALESCE(
      tus_exhaustion_reason,
      CASE
        WHEN COALESCE(public.get_subscription_total_paid(existing_subscription.tus_id), 0)
          >= (COALESCE(public.get_subscription_plan_amount(existing_subscription.tus_id), 0) * 5)
        THEN 'total_5x_limit_reached'
        ELSE 'package_200_day_window_completed'
      END
    )
  FROM public.tbl_subscription_plans existing_plan
  WHERE existing_plan.tsp_id = existing_subscription.tus_plan_id
    AND existing_subscription.tus_user_id = NEW.tus_user_id
    AND existing_subscription.tus_id <> NEW.tus_id
    AND existing_subscription.tus_status IN ('active', 'upgraded')
    AND existing_subscription.tus_exhausted_at IS NULL
    AND COALESCE(existing_subscription.tus_plan_phase, existing_plan.tsp_plan_phase, 'prelaunch') = 'launch'
    AND (
      COALESCE(public.get_subscription_total_paid(existing_subscription.tus_id), 0)
        >= (COALESCE(public.get_subscription_plan_amount(existing_subscription.tus_id), 0) * 5)
      OR COALESCE(public.get_subscription_day_number(existing_subscription.tus_id), 1) > 200
    );

  IF public.user_has_active_same_plan_package(NEW.tus_user_id, NEW.tus_plan_id, NEW.tus_id) THEN
    RAISE EXCEPTION 'You already have an active package for this plan. Renew this plan after the current package is exhausted.';
  END IF;

  IF public.user_has_higher_active_earning_package(NEW.tus_user_id, NEW.tus_plan_id, NEW.tus_id) THEN
    RAISE EXCEPTION 'You cannot buy a lower package while a higher package is still active. Buy the same or higher package only after the higher package is exhausted.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_active_plan_purchase_hierarchy ON public.tbl_user_subscriptions;
CREATE TRIGGER trg_enforce_active_plan_purchase_hierarchy
BEFORE INSERT OR UPDATE OF tus_user_id, tus_plan_id, tus_status, tus_exhausted_at
ON public.tbl_user_subscriptions
FOR EACH ROW
EXECUTE FUNCTION public.enforce_active_plan_purchase_hierarchy();

CREATE OR REPLACE FUNCTION public.get_user_plan_earnings_dashboard()
RETURNS TABLE (
  subscription_id uuid,
  plan_id uuid,
  plan_name text,
  package_kind text,
  status text,
  start_date timestamptz,
  exhausted_at timestamptz,
  exhaustion_reason text,
  plan_amount numeric,
  target_income numeric,
  working_paid numeric,
  non_working_paid numeric,
  total_paid numeric,
  remaining_income numeric,
  days_used integer,
  days_remaining integer,
  income_progress_percent numeric,
  time_progress_percent numeric,
  is_exhausted boolean,
  overall_target_income numeric,
  overall_total_paid numeric,
  overall_remaining_income numeric,
  overall_income_progress_percent numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH user_subscriptions AS (
    SELECT
      us.tus_id,
      us.tus_plan_id,
      COALESCE(NULLIF(btrim(sp.tsp_name), ''), 'Launch Package') AS plan_name,
      COALESCE(us.tus_package_kind, 'registration') AS package_kind,
      us.tus_status,
      us.tus_start_date,
      us.tus_exhausted_at,
      us.tus_exhaustion_reason,
      public.get_subscription_plan_amount(us.tus_id) AS plan_amount,
      public.get_subscription_non_working_paid(us.tus_id) AS non_working_paid,
      public.get_subscription_working_paid(us.tus_id) AS working_paid,
      public.get_subscription_day_number(us.tus_id) AS raw_days_used,
      public.is_subscription_earning_active(us.tus_id) AS earning_active
    FROM public.tbl_user_subscriptions us
    JOIN public.tbl_subscription_plans sp ON sp.tsp_id = us.tus_plan_id
    WHERE us.tus_user_id = auth.uid()
      AND COALESCE(us.tus_plan_phase, sp.tsp_plan_phase, 'prelaunch') = 'launch'
  ),
  calculated AS (
    SELECT
      us.*,
      ROUND((COALESCE(us.non_working_paid, 0) + COALESCE(us.working_paid, 0))::numeric, 6) AS total_paid,
      LEAST(200, GREATEST(1, COALESCE(us.raw_days_used, 1))) AS days_used
    FROM user_subscriptions us
    WHERE COALESCE(us.plan_amount, 0) > 0
  ),
  overall AS (
    SELECT
      COALESCE(SUM(plan_amount * 5) FILTER (WHERE earning_active), 0)::numeric AS overall_target_income,
      COALESCE(SUM(total_paid) FILTER (WHERE earning_active), 0)::numeric AS overall_total_paid
    FROM calculated
  )
  SELECT
    c.tus_id AS subscription_id,
    c.tus_plan_id AS plan_id,
    c.plan_name,
    c.package_kind,
    c.tus_status AS status,
    c.tus_start_date AS start_date,
    c.tus_exhausted_at AS exhausted_at,
    c.tus_exhaustion_reason AS exhaustion_reason,
    c.plan_amount,
    c.plan_amount * 5 AS target_income,
    c.working_paid,
    c.non_working_paid,
    c.total_paid,
    GREATEST(0, (c.plan_amount * 5) - c.total_paid) AS remaining_income,
    c.days_used,
    GREATEST(0, 200 - c.days_used) AS days_remaining,
    ROUND(LEAST(100, GREATEST(0, c.total_paid / NULLIF(c.plan_amount * 5, 0) * 100))::numeric, 2) AS income_progress_percent,
    ROUND(LEAST(100, GREATEST(0, c.days_used::numeric / 200 * 100))::numeric, 2) AS time_progress_percent,
    (NOT c.earning_active) AS is_exhausted,
    o.overall_target_income,
    o.overall_total_paid,
    GREATEST(0, o.overall_target_income - o.overall_total_paid) AS overall_remaining_income,
    ROUND(
      CASE
        WHEN o.overall_target_income > 0 THEN LEAST(100, GREATEST(0, o.overall_total_paid / o.overall_target_income * 100))
        ELSE 0
      END::numeric,
      2
    ) AS overall_income_progress_percent
  FROM calculated c
  CROSS JOIN overall o
  ORDER BY c.tus_start_date DESC NULLS LAST, c.plan_amount DESC, c.tus_id;
$$;

REVOKE EXECUTE ON FUNCTION public.get_subscription_day_number(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_subscription_total_paid(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_subscription_earning_active(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.user_has_higher_active_earning_package(uuid, uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enforce_active_plan_purchase_hierarchy() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_plan_earnings_dashboard() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_subscription_day_number(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_subscription_total_paid(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_subscription_earning_active(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_has_higher_active_earning_package(uuid, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_user_plan_earnings_dashboard() TO authenticated;

UPDATE public.tbl_user_subscriptions us
SET
  tus_status = 'exhausted',
  tus_exhausted_at = COALESCE(tus_exhausted_at, now()),
  tus_exhaustion_reason = COALESCE(
    tus_exhaustion_reason,
    CASE
      WHEN COALESCE(public.get_subscription_total_paid(us.tus_id), 0)
        >= (COALESCE(public.get_subscription_plan_amount(us.tus_id), 0) * 5)
      THEN 'total_5x_limit_reached'
      ELSE 'package_200_day_window_completed'
    END
  )
FROM public.tbl_subscription_plans sp
WHERE sp.tsp_id = us.tus_plan_id
  AND us.tus_status IN ('active', 'upgraded')
  AND us.tus_exhausted_at IS NULL
  AND COALESCE(us.tus_plan_phase, sp.tsp_plan_phase, 'prelaunch') = 'launch'
  AND (
    COALESCE(public.get_subscription_total_paid(us.tus_id), 0)
      >= (COALESCE(public.get_subscription_plan_amount(us.tus_id), 0) * 5)
    OR COALESCE(public.get_subscription_day_number(us.tus_id), 1) > 200
  );

REVOKE EXECUTE ON FUNCTION public.mark_subscription_exhausted_if_needed(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_active_earning_subscriptions(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_active_earning_subscription(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cap_subscription_non_working_credit(uuid, numeric) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cap_subscription_working_credit(uuid, numeric) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.user_has_active_same_plan_package(uuid, uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.mark_subscription_exhausted_if_needed(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_user_active_earning_subscriptions(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_user_active_earning_subscription(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cap_subscription_non_working_credit(uuid, numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.cap_subscription_working_credit(uuid, numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.user_has_active_same_plan_package(uuid, uuid, uuid) TO authenticated, service_role;
