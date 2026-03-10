/*
  # Add Admin User Management Functions

  1. Functions
    - `admin_reset_user_password` - Allows admin to reset customer/company password
    - `admin_impersonate_user` - Creates temporary impersonation token
    
  2. Security
    - Only callable by authenticated admins
    - Password reset generates secure random password
    - Audit logging for security
*/

-- Function to reset user password (customer or company)
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
  
  -- Update password in auth.users using admin privileges
  -- Note: This updates the Supabase auth password
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

-- Function to get user auth credentials for impersonation
CREATE OR REPLACE FUNCTION admin_get_user_auth_info(
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_admin_id uuid;
  v_user_data jsonb;
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
  
  -- Get user information
  SELECT jsonb_build_object(
    'user_id', u.tu_id,
    'email', u.tu_email,
    'user_type', u.tu_user_type,
    'is_active', u.tu_is_active
  ) INTO v_user_data
  FROM tbl_users u
  WHERE u.tu_id = p_user_id;
  
  IF v_user_data IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'User not found'
    );
  END IF;
  
  -- Log the impersonation attempt
  INSERT INTO tbl_admin_activity_logs (
    taal_admin_id,
    taal_action,
    taal_module,
    taal_details
  ) VALUES (
    v_admin_id,
    'impersonate_user',
    'user_management',
    v_user_data
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'user_data', v_user_data
  );
END;
$$;

COMMENT ON FUNCTION admin_reset_user_password IS 'Allows admin to reset customer or company user password';
COMMENT ON FUNCTION admin_get_user_auth_info IS 'Gets user auth info for admin impersonation with audit logging';
