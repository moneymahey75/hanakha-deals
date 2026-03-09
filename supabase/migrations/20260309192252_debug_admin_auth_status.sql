/*
  # Debug Admin Auth Status
  
  1. New Functions
    - `debug_auth_status` - Returns current auth.uid() and admin check results
    
  2. Purpose
    - Helps diagnose authentication issues
    - Shows what auth.uid() returns
    - Shows if admin exists with that auth_uid
*/

CREATE OR REPLACE FUNCTION debug_auth_status()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_uid uuid;
  v_admin_exists boolean;
  v_admin_data json;
BEGIN
  -- Get current auth.uid()
  v_auth_uid := auth.uid();
  
  -- Check if admin exists with this auth_uid
  SELECT EXISTS (
    SELECT 1 FROM tbl_admin_users
    WHERE tau_auth_uid = v_auth_uid
    AND tau_is_active = true
  ) INTO v_admin_exists;
  
  -- Get admin data if exists
  SELECT json_build_object(
    'tau_id', tau_id,
    'tau_email', tau_email,
    'tau_role', tau_role,
    'tau_auth_uid', tau_auth_uid,
    'tau_is_active', tau_is_active
  ) INTO v_admin_data
  FROM tbl_admin_users
  WHERE tau_auth_uid = v_auth_uid
  LIMIT 1;
  
  RETURN json_build_object(
    'auth_uid', v_auth_uid,
    'admin_exists', v_admin_exists,
    'admin_data', v_admin_data,
    'is_authenticated', v_auth_uid IS NOT NULL
  );
END;
$$;

GRANT EXECUTE ON FUNCTION debug_auth_status TO authenticated, anon;
