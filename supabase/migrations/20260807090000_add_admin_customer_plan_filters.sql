-- Add server-side customer grouping for admin Customer Management.

CREATE OR REPLACE FUNCTION public.admin_customer_is_launch_user(p_user_id uuid)
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
      AND (
        LOWER(COALESCE(u.tu_current_plan_phase, '')) = 'launch'
        OR u.tu_launch_plan_activated_at IS NOT NULL
        OR EXISTS (
          SELECT 1
          FROM public.tbl_user_subscriptions us
          JOIN public.tbl_subscription_plans sp ON sp.tsp_id = us.tus_plan_id
          WHERE us.tus_user_id = u.tu_id
            AND us.tus_status IN ('active', 'upgraded')
            AND (us.tus_end_date IS NULL OR us.tus_end_date > now())
            AND LOWER(COALESCE(us.tus_plan_phase, sp.tsp_plan_phase, 'prelaunch')) = 'launch'
            AND COALESCE(sp.tsp_product_code, '') <> 'autopool_20'
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.admin_get_customers_filtered(
  p_search_term text DEFAULT NULL,
  p_status_filter text DEFAULT 'all',
  p_verification_filter text DEFAULT 'all',
  p_offset integer DEFAULT 0,
  p_limit integer DEFAULT 10,
  p_dummy_filter text DEFAULT 'all',
  p_plan_filter text DEFAULT 'all'
)
RETURNS TABLE (
  tu_id uuid,
  tu_email text,
  tu_user_type text,
  tu_is_verified boolean,
  tu_email_verified boolean,
  tu_mobile_verified boolean,
  tu_registration_paid boolean,
  tu_is_active boolean,
  tu_is_dummy boolean,
  tu_created_at timestamptz,
  tu_updated_at timestamptz,
  profile_data jsonb,
  total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_count bigint;
  v_status_filter text := LOWER(COALESCE(p_status_filter, 'all'));
  v_verification_filter text := LOWER(COALESCE(p_verification_filter, 'all'));
  v_dummy_filter text := LOWER(COALESCE(p_dummy_filter, 'all'));
  v_plan_filter text := LOWER(COALESCE(p_plan_filter, 'all'));
BEGIN
  SELECT COUNT(*)
  INTO v_total_count
  FROM public.tbl_users u
  LEFT JOIN public.tbl_user_profiles p ON u.tu_id = p.tup_user_id
  WHERE u.tu_user_type = 'customer'
    AND (
      p_search_term IS NULL
      OR u.tu_email ILIKE '%' || p_search_term || '%'
      OR p.tup_first_name ILIKE '%' || p_search_term || '%'
      OR p.tup_last_name ILIKE '%' || p_search_term || '%'
      OR p.tup_username ILIKE '%' || p_search_term || '%'
      OR p.tup_sponsorship_number ILIKE '%' || p_search_term || '%'
    )
    AND (
      v_status_filter = 'all'
      OR (v_status_filter IN ('disabled', 'inactive') AND COALESCE(u.tu_is_active, false) = false)
      OR (v_status_filter = 'active' AND public.is_user_active_member(u.tu_id))
      OR (
        v_status_filter = 'pending'
        AND COALESCE(u.tu_is_active, false) = true
        AND NOT public.is_user_active_member(u.tu_id)
      )
    )
    AND (
      v_verification_filter = 'all'
      OR (
        v_verification_filter = 'verified'
        AND public.meets_current_verification_requirements(u.tu_email_verified, u.tu_mobile_verified)
      )
      OR (
        v_verification_filter = 'unverified'
        AND NOT public.meets_current_verification_requirements(u.tu_email_verified, u.tu_mobile_verified)
      )
    )
    AND (
      v_dummy_filter = 'all'
      OR (v_dummy_filter = 'real' AND COALESCE(u.tu_is_dummy, false) = false)
      OR (v_dummy_filter = 'dummy' AND COALESCE(u.tu_is_dummy, false) = true)
    )
    AND (
      v_plan_filter = 'all'
      OR (v_plan_filter = 'launch' AND public.admin_customer_is_launch_user(u.tu_id))
      OR (v_plan_filter = 'no_launch' AND NOT public.admin_customer_is_launch_user(u.tu_id))
      OR (
        v_plan_filter = 'autopool'
        AND EXISTS (
          SELECT 1
          FROM public.tbl_autopool_20_memberships membership
          WHERE membership.ta20_user_id = u.tu_id
        )
      )
    );

  RETURN QUERY
  SELECT
    u.tu_id,
    u.tu_email,
    u.tu_user_type,
    public.meets_current_verification_requirements(u.tu_email_verified, u.tu_mobile_verified),
    u.tu_email_verified,
    u.tu_mobile_verified,
    COALESCE(u.tu_registration_paid, false),
    COALESCE(u.tu_is_active, false),
    COALESCE(u.tu_is_dummy, false),
    u.tu_created_at,
    u.tu_updated_at,
    jsonb_build_object(
      'tup_id', p.tup_id,
      'tup_first_name', p.tup_first_name,
      'tup_last_name', p.tup_last_name,
      'tup_username', p.tup_username,
      'tup_mobile', p.tup_mobile,
      'tup_gender', p.tup_gender,
      'tup_sponsorship_number', p.tup_sponsorship_number,
      'tup_parent_account', p.tup_parent_account,
      'tup_parent_name', NULLIF(TRIM(CONCAT_WS(' ', parentp.tup_first_name, parentp.tup_last_name)), ''),
      'tup_parent_username', parentp.tup_username,
      'tup_parent_sponsorship_number', parentp.tup_sponsorship_number,
      'tup_created_at', p.tup_created_at,
      'tup_updated_at', p.tup_updated_at
    ),
    v_total_count
  FROM public.tbl_users u
  LEFT JOIN public.tbl_user_profiles p ON u.tu_id = p.tup_user_id
  LEFT JOIN public.tbl_user_profiles parentp
    ON (
      LOWER(parentp.tup_sponsorship_number) = LOWER(p.tup_parent_account)
      OR LOWER(parentp.tup_sponsorship_number) = LOWER(REGEXP_REPLACE(p.tup_parent_account, '^sp', '', 'i'))
    )
  WHERE u.tu_user_type = 'customer'
    AND (
      p_search_term IS NULL
      OR u.tu_email ILIKE '%' || p_search_term || '%'
      OR p.tup_first_name ILIKE '%' || p_search_term || '%'
      OR p.tup_last_name ILIKE '%' || p_search_term || '%'
      OR p.tup_username ILIKE '%' || p_search_term || '%'
      OR p.tup_sponsorship_number ILIKE '%' || p_search_term || '%'
    )
    AND (
      v_status_filter = 'all'
      OR (v_status_filter IN ('disabled', 'inactive') AND COALESCE(u.tu_is_active, false) = false)
      OR (v_status_filter = 'active' AND public.is_user_active_member(u.tu_id))
      OR (
        v_status_filter = 'pending'
        AND COALESCE(u.tu_is_active, false) = true
        AND NOT public.is_user_active_member(u.tu_id)
      )
    )
    AND (
      v_verification_filter = 'all'
      OR (
        v_verification_filter = 'verified'
        AND public.meets_current_verification_requirements(u.tu_email_verified, u.tu_mobile_verified)
      )
      OR (
        v_verification_filter = 'unverified'
        AND NOT public.meets_current_verification_requirements(u.tu_email_verified, u.tu_mobile_verified)
      )
    )
    AND (
      v_dummy_filter = 'all'
      OR (v_dummy_filter = 'real' AND COALESCE(u.tu_is_dummy, false) = false)
      OR (v_dummy_filter = 'dummy' AND COALESCE(u.tu_is_dummy, false) = true)
    )
    AND (
      v_plan_filter = 'all'
      OR (v_plan_filter = 'launch' AND public.admin_customer_is_launch_user(u.tu_id))
      OR (v_plan_filter = 'no_launch' AND NOT public.admin_customer_is_launch_user(u.tu_id))
      OR (
        v_plan_filter = 'autopool'
        AND EXISTS (
          SELECT 1
          FROM public.tbl_autopool_20_memberships membership
          WHERE membership.ta20_user_id = u.tu_id
        )
      )
    )
  ORDER BY u.tu_created_at DESC
  OFFSET GREATEST(COALESCE(p_offset, 0), 0)
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 10), 1), 100);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_customer_is_launch_user(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_get_customers_filtered(text, text, text, integer, integer, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_customer_is_launch_user(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_get_customers_filtered(text, text, text, integer, integer, text, text) TO service_role;

NOTIFY pgrst, 'reload schema';
