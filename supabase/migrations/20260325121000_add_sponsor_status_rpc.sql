/*
  # Add Sponsor Status RPC for Registration Validation
*/

DROP FUNCTION IF EXISTS get_sponsor_status_by_sponsorship_number(TEXT);

CREATE OR REPLACE FUNCTION get_sponsor_status_by_sponsorship_number(
  p_sponsorship_number TEXT
)
RETURNS TABLE (
  user_id UUID,
  sponsorship_number TEXT,
  first_name TEXT,
  username TEXT,
  is_active BOOLEAN,
  is_registration_paid BOOLEAN,
  email_verified BOOLEAN,
  mobile_verified BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.tup_user_id as user_id,
    p.tup_sponsorship_number as sponsorship_number,
    p.tup_first_name as first_name,
    p.tup_username as username,
    u.tu_is_active as is_active,
    u.tu_registration_paid as is_registration_paid,
    u.tu_email_verified as email_verified,
    u.tu_mobile_verified as mobile_verified
  FROM tbl_user_profiles p
  INNER JOIN tbl_users u ON u.tu_id = p.tup_user_id
  WHERE p.tup_sponsorship_number = p_sponsorship_number
    AND u.tu_user_type = 'customer'
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION get_sponsor_status_by_sponsorship_number(TEXT) TO anon, authenticated, public;

COMMENT ON FUNCTION get_sponsor_status_by_sponsorship_number IS 'Public function to validate sponsor status during registration. Returns active, registration-paid, and verification flags.';
