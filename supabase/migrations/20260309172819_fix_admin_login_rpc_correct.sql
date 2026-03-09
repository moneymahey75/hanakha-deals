/*
  # Fix Admin Login RPC (Correct Version)

  1. Updates
    - Fix admin_login_verify to return password hash for client-side bcrypt comparison
    - Function returns admin data with password hash for verification
    - Client will handle bcrypt comparison

  2. Security
    - Uses SECURITY DEFINER to bypass RLS during login
    - Only returns data for active admins
*/

-- Drop and recreate the function with correct password handling
DROP FUNCTION IF EXISTS admin_login_verify(TEXT, TEXT);

CREATE OR REPLACE FUNCTION admin_login_verify(
  p_email TEXT
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
  admin_password_hash TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Return admin user data by email (for active admins only)
  RETURN QUERY
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
  FROM tbl_admin_users
  WHERE tau_email = p_email
  AND tau_is_active = true;
END;
$$;

-- Grant execute permission to anon and authenticated users
GRANT EXECUTE ON FUNCTION admin_login_verify(TEXT) TO authenticated, anon;

-- Add comment
COMMENT ON FUNCTION admin_login_verify IS 'Returns admin user data by email for login verification. Uses SECURITY DEFINER to bypass RLS.';