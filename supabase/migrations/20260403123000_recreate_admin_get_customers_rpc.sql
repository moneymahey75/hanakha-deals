/*
  # Recreate admin_get_customers RPC (no auth dependency)
*/

CREATE OR REPLACE FUNCTION admin_get_customers(
  p_search_term TEXT DEFAULT NULL,
  p_status_filter TEXT DEFAULT 'all',
  p_verification_filter TEXT DEFAULT 'all',
  p_offset INT DEFAULT 0,
  p_limit INT DEFAULT 10
)
RETURNS TABLE (
  tu_id UUID,
  tu_email TEXT,
  tu_user_type TEXT,
  tu_is_verified BOOLEAN,
  tu_email_verified BOOLEAN,
  tu_mobile_verified BOOLEAN,
  tu_is_active BOOLEAN,
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
         (p_verification_filter = 'unverified' AND u.tu_is_verified = false));

  RETURN QUERY
  SELECT 
    u.tu_id,
    u.tu_email,
    u.tu_user_type,
    u.tu_is_verified,
    u.tu_email_verified,
    u.tu_mobile_verified,
    u.tu_is_active,
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
      'tup_created_at', p.tup_created_at,
      'tup_updated_at', p.tup_updated_at
    ) as profile_data,
    v_total_count
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
  ORDER BY u.tu_created_at DESC
  OFFSET p_offset
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_get_customers(TEXT, TEXT, TEXT, INT, INT) TO authenticated, anon;

COMMENT ON FUNCTION admin_get_customers IS 'Fetches customer data for admin dashboard. Uses SECURITY DEFINER to bypass RLS.';
