/*
  Gate coupon tasks by the subscriber's plan coupon days.
  - If plan.tsp_coupon_days <= 0: coupon tasks are not shown
  - Else: coupon tasks are shown only for N days from tus_start_date (inclusive)
*/

CREATE OR REPLACE FUNCTION get_user_daily_tasks(p_user_id uuid)
RETURNS TABLE (
  task_id uuid,
  task_title text,
  task_description text,
  task_type text,
  content_url text,
  reward_amount numeric(10,2),
  completion_status text,
  expires_at timestamptz,
  coupon_info json,
  completed_at timestamptz
) AS $$
DECLARE
  v_coupon_days integer := 0;
  v_start_date date := NULL;
BEGIN
  SELECT
    COALESCE(p.tsp_coupon_days, 0),
    COALESCE(s.tus_start_date::date, NULL)
  INTO v_coupon_days, v_start_date
  FROM tbl_user_subscriptions s
  JOIN tbl_subscription_plans p ON p.tsp_id = s.tus_plan_id
  WHERE s.tus_user_id = p_user_id
    AND s.tus_status = 'active'
  ORDER BY s.tus_start_date DESC
  LIMIT 1;

  RETURN QUERY
  SELECT 
    dt.tdt_id,
    dt.tdt_title,
    dt.tdt_description,
    dt.tdt_task_type,
    dt.tdt_content_url,
    dt.tdt_reward_amount,
    COALESCE(ut.tut_completion_status, 'assigned'),
    dt.tdt_expires_at,
    CASE 
      WHEN dt.tdt_coupon_id IS NOT NULL THEN
        json_build_object(
          'id', c.tc_id,
          'title', c.tc_title,
          'code', c.tc_coupon_code,
          'image_url', c.tc_image_url
        )
      ELSE NULL
    END,
    ut.tut_completed_at
  FROM tbl_daily_tasks dt
  LEFT JOIN tbl_user_tasks ut ON dt.tdt_id = ut.tut_task_id AND ut.tut_user_id = p_user_id
  LEFT JOIN tbl_coupons c ON dt.tdt_coupon_id = c.tc_id
  WHERE dt.tdt_task_date = CURRENT_DATE
    AND dt.tdt_is_active = true
    AND dt.tdt_expires_at > now()
    AND (
      dt.tdt_coupon_id IS NULL
      OR (
        v_coupon_days > 0
        AND v_start_date IS NOT NULL
        AND (CURRENT_DATE - v_start_date) < v_coupon_days
      )
    )
  ORDER BY dt.tdt_created_at;
END;
$$ LANGUAGE plpgsql;

