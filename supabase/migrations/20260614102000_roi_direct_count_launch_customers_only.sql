-- ROI direct count should count valid active Launch direct customers only.
-- Both the ROI recipient and the qualifying direct children must be Launch-plan
-- customers.

CREATE OR REPLACE FUNCTION public.is_valid_roi_direct_customer(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $valid_roi_launch_direct_customer$
  SELECT EXISTS (
    SELECT 1
    FROM public.tbl_users u
    WHERE u.tu_id = p_user_id
      AND u.tu_user_type = 'customer'
      AND COALESCE(u.tu_is_dummy, false) = false
      AND COALESCE(u.tu_is_active, false) = true
      AND COALESCE(u.tu_registration_paid, false) = true
      AND public.meets_current_verification_requirements(u.tu_email_verified, u.tu_mobile_verified)
      AND EXISTS (
        SELECT 1
        FROM public.tbl_user_subscriptions us
        JOIN public.tbl_subscription_plans sp ON sp.tsp_id = us.tus_plan_id
        WHERE us.tus_user_id = u.tu_id
          AND us.tus_status IN ('active', 'upgraded')
          AND (us.tus_end_date IS NULL OR us.tus_end_date > now())
          AND COALESCE(us.tus_plan_phase, sp.tsp_plan_phase, 'prelaunch') = 'launch'
      )
  );
$valid_roi_launch_direct_customer$;

REVOKE EXECUTE ON FUNCTION public.is_valid_roi_direct_customer(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_valid_roi_direct_customer(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.count_paid_direct_joins(p_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $roi_launch_direct_count$
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
$roi_launch_direct_count$;

REVOKE EXECUTE ON FUNCTION public.count_paid_direct_joins(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.count_paid_direct_joins(uuid) TO authenticated, service_role;
