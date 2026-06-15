-- Add daily open windows for reward coupons.
-- Times are interpreted in Asia/Kolkata business time.

ALTER TABLE public.tbl_coupons
  ADD COLUMN IF NOT EXISTS tc_daily_start_time time NOT NULL DEFAULT '00:00',
  ADD COLUMN IF NOT EXISTS tc_daily_end_time time NOT NULL DEFAULT '23:59:59';

ALTER TABLE public.tbl_coupons
  DROP CONSTRAINT IF EXISTS tbl_coupons_daily_open_window_check;

ALTER TABLE public.tbl_coupons
  ADD CONSTRAINT tbl_coupons_daily_open_window_check
  CHECK (tc_daily_start_time < tc_daily_end_time);

DO $$
DECLARE
  v_function_definition text;
  v_launch_day_condition text := $condition$
      AND c.tc_launch_date >= v_day_start
      AND c.tc_launch_date < v_day_end$condition$;
  v_launch_day_with_window text := $condition$
      AND c.tc_launch_date >= v_day_start
      AND c.tc_launch_date < v_day_end
      AND v_now_time >= c.tc_daily_start_time
      AND v_now_time < c.tc_daily_end_time$condition$;
  v_return_rows_condition text := $condition$
  WHERE rc.turc_user_id = v_user_id
    AND (
      rc.turc_reward_date = v_today
      OR rc.turc_status IN ('opened', 'liked', 'disliked', 'expired')
    )$condition$;
  v_return_rows_with_window text := $condition$
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
    )$condition$;
  v_valid_until_column text := $condition$
      c.tc_valid_until,
      COALESCE(c.tc_reveal_timer_seconds, 30) AS timer_seconds$condition$;
  v_valid_until_with_window_column text := $condition$
      c.tc_valid_until,
      c.tc_daily_end_time,
      COALESCE(c.tc_reveal_timer_seconds, 30) AS timer_seconds$condition$;
  v_available_expiry text := $condition$
      WHEN r.turc_status = 'available' THEN
        ((r.turc_reward_date + 1)::timestamp AT TIME ZONE 'Asia/Kolkata') - interval '1 second'$condition$;
  v_available_expiry_with_window text := $condition$
      WHEN r.turc_status = 'available' THEN
        ((r.turc_reward_date + r.tc_daily_end_time) AT TIME ZONE 'Asia/Kolkata')$condition$;
BEGIN
  SELECT pg_get_functiondef('public.get_user_reward_coupons()'::regprocedure)
  INTO v_function_definition;

  IF v_function_definition IS NULL THEN
    RAISE EXCEPTION 'public.get_user_reward_coupons() does not exist';
  END IF;

  IF position('v_now_time time' IN v_function_definition) = 0 THEN
    v_function_definition := replace(
      v_function_definition,
      'v_today date := public.shopclick_business_date();',
      'v_today date := public.shopclick_business_date();
  v_now_time time := (now() AT TIME ZONE ''Asia/Kolkata'')::time;'
    );
  END IF;

  IF position('c.tc_daily_start_time' IN v_function_definition) = 0 THEN
    v_function_definition := replace(
      v_function_definition,
      v_launch_day_condition,
      v_launch_day_with_window
    );
  END IF;

  IF position('rc.turc_status <> ''available''' IN v_function_definition) = 0 THEN
    v_function_definition := replace(
      v_function_definition,
      v_return_rows_condition,
      v_return_rows_with_window
    );
  END IF;

  IF position('c.tc_daily_end_time,' IN v_function_definition) = 0 THEN
    v_function_definition := replace(
      v_function_definition,
      v_valid_until_column,
      v_valid_until_with_window_column
    );
  END IF;

  IF position('r.tc_daily_end_time' IN v_function_definition) = 0 THEN
    v_function_definition := replace(
      v_function_definition,
      v_available_expiry,
      v_available_expiry_with_window
    );
  END IF;

  EXECUTE v_function_definition;
END;
$$;

DO $$
DECLARE
  v_function_definition text;
BEGIN
  SELECT pg_get_functiondef('public.open_reward_coupon(uuid)'::regprocedure)
  INTO v_function_definition;

  IF v_function_definition IS NULL THEN
    RAISE EXCEPTION 'public.open_reward_coupon(uuid) does not exist';
  END IF;

  IF position('v_now_time time' IN v_function_definition) = 0 THEN
    v_function_definition := replace(
      v_function_definition,
      'v_today date := public.shopclick_business_date();',
      'v_today date := public.shopclick_business_date();
  v_now_time time := (now() AT TIME ZONE ''Asia/Kolkata'')::time;'
    );
  END IF;

  IF position('Coupon is not available at this time' IN v_function_definition) = 0 THEN
    v_function_definition := replace(
      v_function_definition,
      '  v_timer := COALESCE(v_coupon.tc_reveal_timer_seconds, 30);',
      '  IF v_assignment.turc_status = ''available''
     AND (
       v_now_time < v_coupon.tc_daily_start_time
       OR v_now_time >= v_coupon.tc_daily_end_time
     ) THEN
    RAISE EXCEPTION ''Coupon is not available at this time'';
  END IF;

  v_timer := COALESCE(v_coupon.tc_reveal_timer_seconds, 30);'
    );
  END IF;

  EXECUTE v_function_definition;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_user_reward_coupons() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_reward_coupons() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.open_reward_coupon(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.open_reward_coupon(uuid) TO authenticated;
