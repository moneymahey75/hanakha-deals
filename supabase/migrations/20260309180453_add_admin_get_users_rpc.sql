/*
  # Add Admin RPC Functions for User Data Access

  1. New Functions
    - `admin_get_user_info` - Get user information by user ID (for admin use)
    - Validates admin authentication via tbl_admins
    - Returns user profile information

  2. Security
    - Only accessible to authenticated users
    - Validates that the caller is an active admin in tbl_admins
    - Returns minimal user data needed for display purposes
*/

-- Function to get user info for admins
CREATE OR REPLACE FUNCTION admin_get_user_info(p_user_id uuid)
RETURNS TABLE (
  user_id uuid,
  first_name text,
  last_name text,
  email text
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id uuid;
BEGIN
  -- Get the authenticated user's ID
  v_admin_id := auth.uid();
  
  -- Check if the authenticated user is an active admin
  IF NOT EXISTS (
    SELECT 1 FROM tbl_admins
    WHERE ta_auth_uid = v_admin_id
    AND ta_is_active = true
  ) THEN
    RAISE EXCEPTION 'Access denied: User is not an active admin';
  END IF;
  
  -- Return user information
  RETURN QUERY
  SELECT 
    u.tu_id as user_id,
    up.tup_first_name as first_name,
    up.tup_last_name as last_name,
    u.tu_email as email
  FROM tbl_users u
  LEFT JOIN tbl_user_profiles up ON up.tup_user_id = u.tu_id
  WHERE u.tu_id = p_user_id;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION admin_get_user_info(uuid) TO authenticated;