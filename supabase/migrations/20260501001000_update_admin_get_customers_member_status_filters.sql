/*
  # Update admin_get_customers RPC for member-status filtering

  - Adds support for status filters that match UI semantics:
    - active   = enabled + registration paid + mobile verified
    - pending  = enabled but (unpaid OR mobile unverified)
    - disabled = tu_is_active = false (inactive alias supported)
  - Adds dummy account filter support (all/real/dummy)
  - Returns `tu_registration_paid` and `tu_is_dummy` so the admin UI can render status consistently
*/

DROP FUNCTION IF EXISTS public.admin_get_customers(TEXT, TEXT, TEXT, INT, INT);
DROP FUNCTION IF EXISTS public.admin_get_customers(TEXT, TEXT, TEXT, INT, INT, TEXT);

CREATE OR REPLACE FUNCTION public.admin_get_customers(
  p_search_term TEXT DEFAULT NULL,
  p_status_filter TEXT DEFAULT 'all',
  p_verification_filter TEXT DEFAULT 'all',
  p_offset INT DEFAULT 0,
  p_limit INT DEFAULT 10,
  p_dummy_filter TEXT DEFAULT 'all'
)
RETURNS TABLE (
  tu_id UUID,
  tu_email TEXT,
  tu_user_type TEXT,
  tu_is_verified BOOLEAN,
  tu_email_verified BOOLEAN,
  tu_mobile_verified BOOLEAN,
  tu_registration_paid BOOLEAN,
  tu_is_active BOOLEAN,
  tu_is_dummy BOOLEAN,
  tu_created_at TIMESTAMPTZ,
  tu_updated_at TIMESTAMPTZ,
  profile_data JSONB,
  total_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_count BIGINT;
  v_status_filter TEXT := LOWER(COALESCE(p_status_filter, 'all'));
  v_verification_filter TEXT := LOWER(COALESCE(p_verification_filter, 'all'));
  v_dummy_filter TEXT := LOWER(COALESCE(p_dummy_filter, 'all'));
BEGIN
  SELECT COUNT(*)
  INTO v_total_count
  FROM tbl_users u
  LEFT JOIN tbl_user_profiles p ON u.tu_id = p.tup_user_id
  WHERE u.tu_user_type = 'customer'
    AND (
      p_search_term IS NULL OR
      u.tu_email ILIKE '%' || p_search_term || '%' OR
      p.tup_first_name ILIKE '%' || p_search_term || '%' OR
      p.tup_last_name ILIKE '%' || p_search_term || '%' OR
      p.tup_username ILIKE '%' || p_search_term || '%' OR
      p.tup_sponsorship_number ILIKE '%' || p_search_term || '%'
    )
    AND (
      v_status_filter = 'all' OR
      (v_status_filter IN ('disabled', 'inactive') AND COALESCE(u.tu_is_active, false) = false) OR
      (v_status_filter = 'active' AND COALESCE(u.tu_is_active, false) = true AND COALESCE(u.tu_registration_paid, false) = true AND COALESCE(u.tu_mobile_verified, false) = true) OR
      (v_status_filter = 'pending' AND COALESCE(u.tu_is_active, false) = true AND (COALESCE(u.tu_registration_paid, false) = false OR COALESCE(u.tu_mobile_verified, false) = false))
    )
    AND (
      v_verification_filter = 'all' OR
      (v_verification_filter = 'verified' AND COALESCE(u.tu_is_verified, false) = true) OR
      (v_verification_filter = 'unverified' AND COALESCE(u.tu_is_verified, false) = false)
    )
    AND (
      v_dummy_filter = 'all' OR
      (v_dummy_filter = 'real' AND COALESCE(u.tu_is_dummy, false) = false) OR
      (v_dummy_filter = 'dummy' AND COALESCE(u.tu_is_dummy, false) = true)
    );

  RETURN QUERY
  SELECT
    u.tu_id,
    u.tu_email,
    u.tu_user_type,
    u.tu_is_verified,
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
    ) AS profile_data,
    v_total_count
  FROM tbl_users u
  LEFT JOIN tbl_user_profiles p ON u.tu_id = p.tup_user_id
  LEFT JOIN tbl_user_profiles parentp
    ON (
      LOWER(parentp.tup_sponsorship_number) = LOWER(p.tup_parent_account)
      OR LOWER(parentp.tup_sponsorship_number) = LOWER(REGEXP_REPLACE(p.tup_parent_account, '^sp', '', 'i'))
    )
  WHERE u.tu_user_type = 'customer'
    AND (
      p_search_term IS NULL OR
      u.tu_email ILIKE '%' || p_search_term || '%' OR
      p.tup_first_name ILIKE '%' || p_search_term || '%' OR
      p.tup_last_name ILIKE '%' || p_search_term || '%' OR
      p.tup_username ILIKE '%' || p_search_term || '%' OR
      p.tup_sponsorship_number ILIKE '%' || p_search_term || '%'
    )
    AND (
      v_status_filter = 'all' OR
      (v_status_filter IN ('disabled', 'inactive') AND COALESCE(u.tu_is_active, false) = false) OR
      (v_status_filter = 'active' AND COALESCE(u.tu_is_active, false) = true AND COALESCE(u.tu_registration_paid, false) = true AND COALESCE(u.tu_mobile_verified, false) = true) OR
      (v_status_filter = 'pending' AND COALESCE(u.tu_is_active, false) = true AND (COALESCE(u.tu_registration_paid, false) = false OR COALESCE(u.tu_mobile_verified, false) = false))
    )
    AND (
      v_verification_filter = 'all' OR
      (v_verification_filter = 'verified' AND COALESCE(u.tu_is_verified, false) = true) OR
      (v_verification_filter = 'unverified' AND COALESCE(u.tu_is_verified, false) = false)
    )
    AND (
      v_dummy_filter = 'all' OR
      (v_dummy_filter = 'real' AND COALESCE(u.tu_is_dummy, false) = false) OR
      (v_dummy_filter = 'dummy' AND COALESCE(u.tu_is_dummy, false) = true)
    )
  ORDER BY u.tu_created_at DESC
  OFFSET p_offset
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_customers(TEXT, TEXT, TEXT, INT, INT, TEXT) TO authenticated, anon, service_role;

COMMENT ON FUNCTION public.admin_get_customers IS 'Fetches customer data for admin customer management with member-status filtering (active/pending/disabled) and dummy account scope.';

