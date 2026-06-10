CREATE OR REPLACE FUNCTION public.cleanup_expired_reward_coupons(
  p_before_date date DEFAULT public.shopclick_business_date(),
  p_limit integer DEFAULT 50000
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted_count integer;
BEGIN
  WITH expired_rows AS (
    SELECT rc.turc_id
    FROM public.tbl_user_reward_coupons rc
    JOIN public.tbl_coupons c ON c.tc_id = rc.turc_coupon_id
    WHERE (
        rc.turc_status = 'available'
        AND rc.turc_reward_date < p_before_date
      )
      OR (
        rc.turc_status IN ('opened', 'liked', 'disliked', 'expired')
        AND p_before_date > (((c.tc_valid_until AT TIME ZONE 'Asia/Kolkata')::date) + 1)
      )
    ORDER BY rc.turc_reward_date, rc.turc_id
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50000), 200000))
  ),
  deleted AS (
    DELETE FROM public.tbl_user_reward_coupons rc
    USING expired_rows er
    WHERE rc.turc_id = er.turc_id
    RETURNING rc.turc_id
  )
  SELECT COUNT(*)::integer INTO v_deleted_count
  FROM deleted;

  RETURN COALESCE(v_deleted_count, 0);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cleanup_expired_reward_coupons(date, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cleanup_expired_reward_coupons(date, integer) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_expired_reward_coupons(date, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_reward_coupons(date, integer) TO service_role;

DROP FUNCTION IF EXISTS public.get_user_reward_coupons();

CREATE OR REPLACE FUNCTION public.get_user_reward_coupons()
RETURNS TABLE (
  assignment_id uuid,
  coupon_id uuid,
  title text,
  description text,
  coupon_code text,
  image_url text,
  website_url text,
  reward_amount numeric,
  reward_date date,
  day_number integer,
  daily_target_amount numeric,
  assigned_total_amount numeric,
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
  expires_at timestamptz
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

  SELECT * INTO v_subscription
  FROM public.get_latest_launch_reward_subscription(v_user_id)
  LIMIT 1;

  IF v_subscription.subscription_id IS NOT NULL THEN
    v_daily_amount := ROUND((COALESCE(v_subscription.plan_amount, 0) * 0.01)::numeric, 6);

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
          AND (COALESCE(c.tc_reward_percentage, 0) > 0 OR COALESCE(c.tc_share_reward_amount, 0) > 0)
          AND NOT EXISTS (
            SELECT 1
            FROM public.tbl_user_reward_coupons existing
            WHERE existing.turc_user_id = v_user_id
              AND existing.turc_coupon_id = c.tc_id
              AND existing.turc_reward_date = v_today
          )
      ) ranked
      WHERE ranked.amount_before < v_remaining_daily_amount
    ) assigned
    WHERE assigned.reward_amount > 0
    ON CONFLICT (turc_user_id, turc_coupon_id, turc_reward_date) DO NOTHING;
  END IF;

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
        rc.turc_reward_date = v_today
        OR rc.turc_status IN ('opened', 'liked', 'disliked', 'expired')
      )
  )
  SELECT
    r.turc_id,
    r.turc_coupon_id,
    r.tc_title,
    r.tc_description,
    r.tc_coupon_code,
    r.tc_image_url,
    r.tc_website_url,
    r.turc_reward_amount,
    r.turc_reward_date,
    r.turc_day_number,
    r.turc_daily_target_amount,
    SUM(r.turc_reward_amount) OVER (PARTITION BY r.turc_reward_date),
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
        ((r.turc_reward_date + 1)::timestamp AT TIME ZONE 'Asia/Kolkata') - interval '1 second'
      ELSE
        ((((r.tc_valid_until AT TIME ZONE 'Asia/Kolkata')::date + 1)::timestamp AT TIME ZONE 'Asia/Kolkata') - interval '1 second')
    END
  FROM rows r
  ORDER BY r.turc_reward_date DESC, r.turc_created_at DESC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_user_reward_coupons() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_reward_coupons() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_user_reward_coupons() TO authenticated;
