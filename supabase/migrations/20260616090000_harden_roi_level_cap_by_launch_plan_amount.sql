-- Enforce ROI-to-ROI level caps by active/upgraded Launch plan amount.
-- 50 USDT => levels 1-7
-- 100 USDT => levels 1-10
-- 200 USDT => levels 1-15

CREATE OR REPLACE FUNCTION public.get_user_roi_level_cap(p_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH launch_plan AS (
    SELECT
      MAX(
        GREATEST(
          COALESCE(us.tus_payment_amount, 0),
          COALESCE(sp.tsp_price, 0)
        )
      )::numeric AS plan_amount
    FROM public.tbl_user_subscriptions us
    JOIN public.tbl_subscription_plans sp ON sp.tsp_id = us.tus_plan_id
    WHERE us.tus_user_id = p_user_id
      AND us.tus_status IN ('active', 'upgraded')
      AND (us.tus_end_date IS NULL OR us.tus_end_date > now())
      AND COALESCE(us.tus_plan_phase, sp.tsp_plan_phase, 'prelaunch') = 'launch'
  )
  SELECT CASE
    WHEN COALESCE(plan_amount, 0) >= 200 THEN 15
    WHEN COALESCE(plan_amount, 0) >= 100 THEN 10
    WHEN COALESCE(plan_amount, 0) >= 50 THEN 7
    ELSE 0
  END
  FROM launch_plan;
$$;

REVOKE EXECUTE ON FUNCTION public.get_user_roi_level_cap(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_roi_level_cap(uuid) TO authenticated, service_role;
