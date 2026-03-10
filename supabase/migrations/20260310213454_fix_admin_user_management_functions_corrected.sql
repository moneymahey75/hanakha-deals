/*
  # Fix Admin User Management Functions (Corrected)

  1. Purpose
    - Recreates admin_reset_user_password function with proper schema-qualified pgcrypto functions
    - Ensures password reset works correctly
    
  2. Security
    - Only callable by authenticated admins
    - Audit logging for security
*/

-- Drop and recreate the function with corrected schema references
DROP FUNCTION IF EXISTS admin_reset_user_password(uuid, text);

CREATE OR REPLACE FUNCTION admin_reset_user_password(
  p_user_id uuid,
  p_new_password text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_admin_id uuid;
  v_user_email text;
  v_auth_id uuid;
BEGIN
  -- Verify caller is an admin
  SELECT tau_id INTO v_admin_id
  FROM tbl_admin_users
  WHERE tau_auth_uid = auth.uid()
  AND tau_is_active = true
  AND tau_role IN ('super_admin', 'sub_admin');
  
  IF v_admin_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Unauthorized: Admin access required'
    );
  END IF;
  
  -- Get user details
  SELECT tu_email, tu_id INTO v_user_email, v_auth_id
  FROM tbl_users
  WHERE tu_id = p_user_id;
  
  IF v_user_email IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'User not found'
    );
  END IF;
  
  -- Update password in auth.users using admin privileges with proper schema
  UPDATE auth.users
  SET
    encrypted_password = extensions.crypt(p_new_password, extensions.gen_salt('bf')),
    updated_at = now()
  WHERE id = v_auth_id;
  
  -- Log the action
  INSERT INTO tbl_admin_activity_logs (
    taal_admin_id,
    taal_action,
    taal_module,
    taal_details
  ) VALUES (
    v_admin_id,
    'reset_password',
    'user_management',
    jsonb_build_object(
      'user_id', p_user_id,
      'user_email', v_user_email
    )
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Password reset successfully',
    'user_email', v_user_email
  );
END;
$$;

COMMENT ON FUNCTION admin_reset_user_password IS 'Allows admin to reset customer or company user password using proper schema-qualified crypto functions';
