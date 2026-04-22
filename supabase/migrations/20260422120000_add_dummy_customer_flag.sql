/*
  # Add dummy/fake customer flag
  - Adds `tu_is_dummy` to `tbl_users`
  - Extends `admin_get_customers` RPC to return/filter dummy accounts
*/

ALTER TABLE IF EXISTS public.tbl_users
ADD COLUMN IF NOT EXISTS tu_is_dummy BOOLEAN NOT NULL DEFAULT FALSE;

-- Keep admin_get_customers backward-compatible by adding a new optional parameter with a default.
CREATE OR REPLACE FUNCTION public.admin_get_customers(
  p_search_term TEXT DEFAULT NULL,
  p_status_filter TEXT DEFAULT 'all',
  p_verification_filter TEXT DEFAULT 'all',
  p_offset INT DEFAULT 0,
  p_limit INT DEFAULT 10,
  p_dummy_filter TEXT DEFAULT 'all' -- 'all' | 'real' | 'dummy'
)
RETURNS TABLE (
  tu_id UUID,
  tu_email TEXT,
  tu_user_type TEXT,
  tu_is_verified BOOLEAN,
  tu_email_verified BOOLEAN,
  tu_mobile_verified BOOLEAN,
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
BEGIN
  SELECT COUNT(*)
  INTO v_total_count
  FROM tbl_users u
  LEFT JOIN tbl_user_profiles p ON u.tu_id = p.tup_user_id
  WHERE u.tu_user_type = 'customer'
    AND (p_search_term IS NULL OR
         u.tu_email ILIKE '%' || p_search_term || '%' OR
         p.tup_first_name ILIKE '%' || p_search_term || '%' OR
         p.tup_last_name ILIKE '%' || p_search_term || '%' OR
         p.tup_username ILIKE '%' || p_search_term || '%' OR
         p.tup_sponsorship_number ILIKE '%' || p_search_term || '%')
    AND (p_status_filter = 'all' OR
         (p_status_filter = 'active' AND u.tu_is_active = true) OR
         (p_status_filter = 'inactive' AND u.tu_is_active = false))
    AND (p_verification_filter = 'all' OR
         (p_verification_filter = 'verified' AND u.tu_is_verified = true) OR
         (p_verification_filter = 'unverified' AND u.tu_is_verified = false))
    AND (
      p_dummy_filter = 'all'
      OR (p_dummy_filter = 'real' AND COALESCE(u.tu_is_dummy, false) = false)
      OR (p_dummy_filter = 'dummy' AND COALESCE(u.tu_is_dummy, false) = true)
    );

  RETURN QUERY
  SELECT
    u.tu_id,
    u.tu_email,
    u.tu_user_type,
    u.tu_is_verified,
    u.tu_email_verified,
    u.tu_mobile_verified,
    u.tu_is_active,
    COALESCE(u.tu_is_dummy, false) AS tu_is_dummy,
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
    ) as profile_data,
    v_total_count
  FROM tbl_users u
  LEFT JOIN tbl_user_profiles p ON u.tu_id = p.tup_user_id
  LEFT JOIN tbl_user_profiles parentp
    ON (
      LOWER(parentp.tup_sponsorship_number) = LOWER(p.tup_parent_account)
      OR LOWER(parentp.tup_sponsorship_number) = LOWER(REGEXP_REPLACE(p.tup_parent_account, '^sp', '', 'i'))
    )
  WHERE u.tu_user_type = 'customer'
    AND (p_search_term IS NULL OR
         u.tu_email ILIKE '%' || p_search_term || '%' OR
         p.tup_first_name ILIKE '%' || p_search_term || '%' OR
         p.tup_last_name ILIKE '%' || p_search_term || '%' OR
         p.tup_username ILIKE '%' || p_search_term || '%' OR
         p.tup_sponsorship_number ILIKE '%' || p_search_term || '%')
    AND (p_status_filter = 'all' OR
         (p_status_filter = 'active' AND u.tu_is_active = true) OR
         (p_status_filter = 'inactive' AND u.tu_is_active = false))
    AND (p_verification_filter = 'all' OR
         (p_verification_filter = 'verified' AND u.tu_is_verified = true) OR
         (p_verification_filter = 'unverified' AND u.tu_is_verified = false))
    AND (
      p_dummy_filter = 'all'
      OR (p_dummy_filter = 'real' AND COALESCE(u.tu_is_dummy, false) = false)
      OR (p_dummy_filter = 'dummy' AND COALESCE(u.tu_is_dummy, false) = true)
    )
  ORDER BY u.tu_created_at DESC
  OFFSET p_offset
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_customers(TEXT, TEXT, TEXT, INT, INT, TEXT) TO authenticated, anon;

COMMENT ON FUNCTION public.admin_get_customers(TEXT, TEXT, TEXT, INT, INT, TEXT) IS 'Fetches customer data for admin dashboard (includes parent name and dummy filter). Uses SECURITY DEFINER to bypass RLS.';
