/*
  # Add Get Admin By ID RPC

  1. New Functions
    - `get_admin_by_id` - Fetches admin user data by ID
      - Takes admin_id as parameter
      - Uses SECURITY DEFINER to bypass RLS
      - Returns admin user data

  2. Security
    - Uses SECURITY DEFINER to read without authentication
    - Only returns data for active admins
*/

-- Create function to get admin by ID
CREATE OR REPLACE FUNCTION get_admin_by_id(
  p_admin_id UUID
)
RETURNS TABLE (
  tau_id UUID,
  tau_email TEXT,
  tau_full_name TEXT,
  tau_role admin_role,
  tau_permissions JSONB,
  tau_is_active BOOLEAN,
  tau_last_login TIMESTAMPTZ,
  tau_created_at TIMESTAMPTZ,
  tau_auth_uid UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    tbl_admin_users.tau_id,
    tbl_admin_users.tau_email,
    tbl_admin_users.tau_full_name,
    tbl_admin_users.tau_role,
    tbl_admin_users.tau_permissions,
    tbl_admin_users.tau_is_active,
    tbl_admin_users.tau_last_login,
    tbl_admin_users.tau_created_at,
    tbl_admin_users.tau_auth_uid
  FROM tbl_admin_users
  WHERE tbl_admin_users.tau_id = p_admin_id
  AND tbl_admin_users.tau_is_active = true;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_admin_by_id(UUID) TO authenticated, anon;

-- Add comment
COMMENT ON FUNCTION get_admin_by_id IS 'Fetches admin user data by ID for session validation. Uses SECURITY DEFINER to bypass RLS.';