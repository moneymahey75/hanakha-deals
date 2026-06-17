-- Assign daily reward coupons per active package, not just per user.
-- If a customer owns 100 USDT and 200 USDT active packages, the same launched
-- coupon is assigned once for each package and each assignment earns from that
-- package's own 1% daily target / 2x non-working cap.

ALTER TABLE public.tbl_user_reward_coupons
  DROP CONSTRAINT IF EXISTS tbl_user_reward_coupons_once_per_day;

ALTER TABLE public.tbl_user_reward_coupons
  DROP CONSTRAINT IF EXISTS tbl_user_reward_coupons_once_per_package_day;

ALTER TABLE public.tbl_user_reward_coupons
  ADD CONSTRAINT tbl_user_reward_coupons_once_per_package_day
  UNIQUE (turc_user_id, turc_subscription_id, turc_coupon_id, turc_reward_date);

CREATE INDEX IF NOT EXISTS idx_reward_coupons_package_day
  ON public.tbl_user_reward_coupons(turc_user_id, turc_subscription_id, turc_reward_date DESC);

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
      GREATEST(
        1,
        ((public.shopclick_business_date() - COALESCE((us.tus_start_date AT TIME ZONE 'Asia/Kolkata')::date, public.shopclick_business_date())) + 1)::integer
      ) AS package_day_number,
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
    GREATEST(0, (c.package_amount * 5) - c.package_working_paid) AS working_remaining
  FROM candidates c
  WHERE c.package_amount > 0
    AND c.package_day_number BETWEEN 1 AND 200
    AND c.package_non_working_paid < (c.package_amount * 2)
    AND c.package_working_paid < (c.package_amount * 5)
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

REVOKE EXECUTE ON FUNCTION public.get_user_active_earning_subscriptions(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_active_earning_subscriptions(uuid) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.get_user_reward_coupons();

CREATE OR REPLACE FUNCTION public.get_user_reward_coupons()
RETURNS TABLE (
  assignment_id uuid,
  coupon_id uuid,
  subscription_id uuid,
  title text,
  description text,
  coupon_code text,
  image_url text,
  website_url text,
  reward_amount numeric,
  reward_date date,
  day_number integer,
  daily_target_amount numeric,
  package_plan_amount numeric,
  package_daily_target_amount numeric,
  assigned_total_amount numeric,
  total_daily_target_amount numeric,
  status text,
  opened_at timestamptz,
  reaction_available_at timestamptz,
  reacted_at timestamptz,
  reaction text,
  timer_seconds integer,
  feedback_enabled boolean,
  feedback_samples text[],
  coupon_valid_until timestamptz,
  is_expired boolean,
  expires_at timestamptz,
  site_visited_at timestamptz,
  rating integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_subscription record;
  v_daily_amount numeric;
  v_existing_assigned_amount numeric;
  v_remaining_daily_amount numeric;
  v_today date := public.shopclick_business_date();
  v_day_start timestamptz := public.shopclick_business_date()::timestamp AT TIME ZONE 'Asia/Kolkata';
  v_day_end timestamptz := (public.shopclick_business_date() + 1)::timestamp AT TIME ZONE 'Asia/Kolkata';
  v_now_time time := (now() AT TIME ZONE 'Asia/Kolkata')::time;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  DELETE FROM public.tbl_user_reward_coupons
  WHERE turc_user_id = v_user_id
    AND turc_status = 'available'
    AND turc_reward_date < v_today;

  DELETE FROM public.tbl_user_reward_coupons rc
  USING public.tbl_coupons c
  WHERE rc.turc_user_id = v_user_id
    AND rc.turc_coupon_id = c.tc_id
    AND rc.turc_status IN ('opened', 'liked', 'disliked', 'expired')
    AND v_today > (((c.tc_valid_until AT TIME ZONE 'Asia/Kolkata')::date) + 1);

  FOR v_subscription IN
    SELECT *
    FROM public.get_user_active_earning_subscriptions(v_user_id)
  LOOP
    v_daily_amount := ROUND((COALESCE(v_subscription.plan_amount, 0) * 0.01)::numeric, 6);
    v_daily_amount := LEAST(v_daily_amount, COALESCE(v_subscription.non_working_remaining, 0));

    IF v_daily_amount <= 0 THEN
      PERFORM public.mark_subscription_exhausted_if_needed(v_subscription.subscription_id);
      CONTINUE;
    END IF;

    UPDATE public.tbl_user_reward_coupons rc
    SET
      turc_plan_amount = v_subscription.plan_amount,
      turc_daily_target_amount = v_daily_amount,
      turc_day_number = v_subscription.day_number,
      turc_reward_amount = LEAST(
        v_daily_amount,
        ROUND(
          CASE
            WHEN COALESCE(c.tc_reward_percentage, 0) > 0 THEN
              (COALESCE(v_subscription.plan_amount, 0) * COALESCE(c.tc_reward_percentage, 0) / 100)::numeric
            ELSE
              COALESCE(c.tc_share_reward_amount, 0)::numeric
          END,
          6
        )
      )
    FROM public.tbl_coupons c
    WHERE rc.turc_coupon_id = c.tc_id
      AND rc.turc_user_id = v_user_id
      AND rc.turc_subscription_id = v_subscription.subscription_id
      AND rc.turc_reward_date = v_today
      AND rc.turc_status IN ('available', 'opened')
      AND c.tc_status = 'approved'
      AND c.tc_is_active = true
      AND COALESCE(c.tc_launch_now, false) = true
      AND c.tc_launch_date >= v_day_start
      AND c.tc_launch_date < v_day_end
      AND v_now_time >= c.tc_daily_start_time
      AND v_now_time < c.tc_daily_end_time
      AND (COALESCE(c.tc_reward_percentage, 0) > 0 OR COALESCE(c.tc_share_reward_amount, 0) > 0);

    SELECT COALESCE(SUM(turc_reward_amount), 0)
      INTO v_existing_assigned_amount
    FROM public.tbl_user_reward_coupons
    WHERE turc_user_id = v_user_id
      AND turc_subscription_id = v_subscription.subscription_id
      AND turc_reward_date = v_today
      AND turc_status IN ('available', 'opened', 'liked', 'disliked');

    v_remaining_daily_amount := GREATEST(v_daily_amount - COALESCE(v_existing_assigned_amount, 0), 0);

    INSERT INTO public.tbl_user_reward_coupons (
      turc_user_id,
      turc_subscription_id,
      turc_coupon_id,
      turc_reward_date,
      turc_day_number,
      turc_plan_amount,
      turc_daily_target_amount,
      turc_reward_amount
    )
    SELECT
      v_user_id,
      v_subscription.subscription_id,
      assigned.tc_id,
      v_today,
      v_subscription.day_number,
      v_subscription.plan_amount,
      v_daily_amount,
      assigned.reward_amount
    FROM (
      SELECT
        ranked.tc_id,
        LEAST(
          ranked.coupon_amount,
          GREATEST(v_remaining_daily_amount - ranked.amount_before, 0)
        ) AS reward_amount
      FROM (
        SELECT
          c.tc_id,
          ROUND(
            CASE
              WHEN COALESCE(c.tc_reward_percentage, 0) > 0 THEN
                (COALESCE(v_subscription.plan_amount, 0) * COALESCE(c.tc_reward_percentage, 0) / 100)::numeric
              ELSE
                COALESCE(c.tc_share_reward_amount, 0)::numeric
            END,
            6
          ) AS coupon_amount,
          COALESCE(
            SUM(
              ROUND(
                CASE
                  WHEN COALESCE(c.tc_reward_percentage, 0) > 0 THEN
                    (COALESCE(v_subscription.plan_amount, 0) * COALESCE(c.tc_reward_percentage, 0) / 100)::numeric
                  ELSE
                    COALESCE(c.tc_share_reward_amount, 0)::numeric
                END,
                6
              )
            )
              OVER (ORDER BY c.tc_created_at, c.tc_id ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),
            0
          ) AS amount_before
        FROM public.tbl_coupons c
        WHERE c.tc_status = 'approved'
          AND c.tc_is_active = true
          AND COALESCE(c.tc_launch_now, false) = true
          AND c.tc_launch_date >= v_day_start
          AND c.tc_launch_date < v_day_end
          AND v_now_time >= c.tc_daily_start_time
          AND v_now_time < c.tc_daily_end_time
          AND (COALESCE(c.tc_reward_percentage, 0) > 0 OR COALESCE(c.tc_share_reward_amount, 0) > 0)
          AND NOT EXISTS (
            SELECT 1
            FROM public.tbl_user_reward_coupons existing
            WHERE existing.turc_user_id = v_user_id
              AND existing.turc_subscription_id = v_subscription.subscription_id
              AND existing.turc_coupon_id = c.tc_id
              AND existing.turc_reward_date = v_today
          )
      ) ranked
      WHERE ranked.amount_before < v_remaining_daily_amount
    ) assigned
    WHERE assigned.reward_amount > 0
    ON CONFLICT (turc_user_id, turc_subscription_id, turc_coupon_id, turc_reward_date) DO NOTHING;
  END LOOP;

  RETURN QUERY
  WITH rows AS (
    SELECT
      rc.*,
      c.tc_title,
      c.tc_description,
      CASE
        WHEN rc.turc_status IN ('liked', 'disliked')
          OR (
            rc.turc_status = 'opened'
            AND (
              rc.turc_reaction_available_at IS NULL
              OR now() >= rc.turc_reaction_available_at
            )
          )
        THEN c.tc_coupon_code
        ELSE NULL
      END AS tc_coupon_code,
      c.tc_image_url,
      c.tc_website_url,
      c.tc_valid_until,
      c.tc_daily_end_time,
      COALESCE(c.tc_reveal_timer_seconds, 30) AS timer_seconds,
      COALESCE(c.tc_feedback_enabled, false) AS feedback_enabled,
      COALESCE(c.tc_feedback_samples, '{}'::text[]) AS feedback_samples,
      (
        rc.turc_status IN ('opened', 'liked', 'disliked', 'expired')
        AND v_today > (c.tc_valid_until AT TIME ZONE 'Asia/Kolkata')::date
      ) AS is_expired
    FROM public.tbl_user_reward_coupons rc
    JOIN public.tbl_coupons c ON c.tc_id = rc.turc_coupon_id
    WHERE rc.turc_user_id = v_user_id
      AND (
        (
          rc.turc_reward_date = v_today
          AND (
            rc.turc_status <> 'available'
            OR (
              v_now_time >= c.tc_daily_start_time
              AND v_now_time < c.tc_daily_end_time
            )
          )
        )
        OR rc.turc_status IN ('opened', 'liked', 'disliked', 'expired')
      )
  ),
  date_totals AS (
    SELECT
      target_rows.turc_reward_date,
      SUM(target_rows.package_daily_target_amount)::numeric AS total_daily_target_amount
    FROM (
      SELECT DISTINCT
        rows.turc_reward_date,
        rows.turc_subscription_id,
        rows.turc_daily_target_amount AS package_daily_target_amount
      FROM rows
    ) target_rows
    GROUP BY target_rows.turc_reward_date
  )
  SELECT
    r.turc_id,
    r.turc_coupon_id,
    r.turc_subscription_id,
    r.tc_title,
    r.tc_description,
    r.tc_coupon_code,
    r.tc_image_url,
    r.tc_website_url,
    r.turc_reward_amount,
    r.turc_reward_date,
    r.turc_day_number,
    r.turc_daily_target_amount,
    r.turc_plan_amount,
    r.turc_daily_target_amount,
    SUM(r.turc_reward_amount) OVER (PARTITION BY r.turc_reward_date),
    COALESCE(dt.total_daily_target_amount, r.turc_daily_target_amount),
    r.turc_status,
    r.turc_opened_at,
    r.turc_reaction_available_at,
    r.turc_reacted_at,
    r.turc_reaction,
    r.timer_seconds,
    r.feedback_enabled,
    r.feedback_samples,
    r.tc_valid_until,
    r.is_expired,
    CASE
      WHEN r.turc_status = 'available' THEN
        ((r.turc_reward_date + r.tc_daily_end_time) AT TIME ZONE 'Asia/Kolkata')
      ELSE
        ((((r.tc_valid_until AT TIME ZONE 'Asia/Kolkata')::date + 1)::timestamp AT TIME ZONE 'Asia/Kolkata') - interval '1 second')
    END,
    r.turc_site_visited_at,
    r.turc_rating
  FROM rows r
  LEFT JOIN date_totals dt ON dt.turc_reward_date = r.turc_reward_date
  ORDER BY r.turc_reward_date DESC, r.turc_created_at DESC, r.turc_subscription_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_user_reward_coupons() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_reward_coupons() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_user_reward_coupons() TO authenticated;
