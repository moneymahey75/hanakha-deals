/*
  # Require Registration-Paid Sponsor for Referral Validation
*/

DROP FUNCTION IF EXISTS get_sponsor_by_sponsorship_number(TEXT);

CREATE OR REPLACE FUNCTION get_sponsor_by_sponsorship_number(
  p_sponsorship_number TEXT
)
RETURNS TABLE (
  user_id UUID,
  sponsorship_number TEXT,
  first_name TEXT,
  username TEXT
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
    p.tup_username as username
  FROM tbl_user_profiles p
  INNER JOIN tbl_users u ON u.tu_id = p.tup_user_id
  WHERE p.tup_sponsorship_number = p_sponsorship_number
    AND u.tu_is_active = true
    AND u.tu_registration_paid = true
    AND u.tu_user_type = 'customer'
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION get_sponsor_by_sponsorship_number(TEXT) TO anon, authenticated, public;

COMMENT ON FUNCTION get_sponsor_by_sponsorship_number IS 'Public function to validate sponsorship numbers during registration. Returns basic sponsor info only for active and registration-paid customers.';
