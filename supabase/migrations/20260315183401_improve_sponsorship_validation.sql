/*
  # Improve Sponsorship Number Validation Function

  1. Changes
    - Update get_sponsor_by_sponsorship_number to check user is active
    - Ensure only active customers can be used as sponsors
    - Improve function stability and error handling

  2. Security
    - Uses SECURITY DEFINER to bypass RLS
    - Only returns data for active customers
    - Accessible to anonymous users (needed for registration)
*/

-- Drop and recreate the function with active user check
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
  -- Return sponsor info only if they are an active customer
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
    AND u.tu_user_type = 'customer'
  LIMIT 1;
END;
$$;

-- Grant execute permission to all users (needed for registration)
GRANT EXECUTE ON FUNCTION get_sponsor_by_sponsorship_number(TEXT) TO anon, authenticated, public;

-- Add comment
COMMENT ON FUNCTION get_sponsor_by_sponsorship_number IS 'Public function to validate sponsorship numbers during registration. Returns basic sponsor info only for active customers.';
