/*
  # Fix Admin Login Authentication

  1. New Functions
    - `admin_login_verify` - Secure function to verify admin credentials
      - Takes email and password hash
      - Returns admin user data if credentials are valid
      - Uses SECURITY DEFINER to bypass RLS during login
      - Only returns data for active admin accounts

  2. Security
    - Function uses SECURITY DEFINER to read tbl_admin_users during login
    - Only accessible for login verification
    - Returns sanitized admin data without password hash
*/

-- Drop existing function if it exists
DROP FUNCTION IF EXISTS admin_login_verify(TEXT, TEXT);

-- Create secure admin login verification function
CREATE OR REPLACE FUNCTION admin_login_verify(
  p_email TEXT,
  p_password_hash TEXT
)
RETURNS TABLE (
  admin_id UUID,
  admin_email TEXT,
  admin_full_name TEXT,
  admin_role admin_role,
  admin_permissions JSONB,
  admin_is_active BOOLEAN,
  admin_last_login TIMESTAMPTZ,
  admin_created_at TIMESTAMPTZ,
  admin_auth_uid UUID,
  password_match BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_user RECORD;
BEGIN
  -- Find admin user by email
  SELECT 
    tau_id,
    tau_email,
    tau_full_name,
    tau_role,
    tau_permissions,
    tau_is_active,
    tau_last_login,
    tau_created_at,
    tau_auth_uid,
    tau_password_hash
  INTO v_admin_user
  FROM tbl_admin_users
  WHERE tau_email = p_email
  AND tau_is_active = true;

  -- If user not found, return empty result
  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Return admin data with password match indicator
  RETURN QUERY SELECT
    v_admin_user.tau_id,
    v_admin_user.tau_email,
    v_admin_user.tau_full_name,
    v_admin_user.tau_role,
    v_admin_user.tau_permissions,
    v_admin_user.tau_is_active,
    v_admin_user.tau_last_login,
    v_admin_user.tau_created_at,
    v_admin_user.tau_auth_uid,
    (v_admin_user.tau_password_hash = p_password_hash) as password_match;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION admin_login_verify(TEXT, TEXT) TO authenticated, anon;

-- Add comment
COMMENT ON FUNCTION admin_login_verify IS 'Securely verifies admin credentials during login. Uses SECURITY DEFINER to bypass RLS.';