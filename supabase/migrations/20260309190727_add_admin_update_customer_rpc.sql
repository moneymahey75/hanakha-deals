/*
  # Add Admin Customer Update RPC Functions
  
  1. New Functions
    - `admin_update_customer_user` - Updates tbl_users table with SECURITY DEFINER
    - `admin_update_customer_profile` - Updates tbl_user_profiles table with SECURITY DEFINER
    
  2. Security
    - Functions use SECURITY DEFINER to bypass RLS
    - Only accessible to authenticated admins
    - Validates admin status before allowing updates
*/

-- Function to update customer user data
CREATE OR REPLACE FUNCTION admin_update_customer_user(
  p_user_id uuid,
  p_email text,
  p_is_verified boolean,
  p_email_verified boolean,
  p_mobile_verified boolean,
  p_is_active boolean
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
BEGIN
  -- Check if caller is an admin
  SELECT EXISTS (
    SELECT 1 FROM tbl_admin_users
    WHERE tau_auth_uid = auth.uid()
    AND tau_is_active = true
  ) INTO v_is_admin;
  
  IF NOT v_is_admin THEN
    RETURN json_build_object('success', false, 'error', 'Unauthorized');
  END IF;
  
  -- Update user
  UPDATE tbl_users
  SET 
    tu_email = p_email,
    tu_is_verified = p_is_verified,
    tu_email_verified = p_email_verified,
    tu_mobile_verified = p_mobile_verified,
    tu_is_active = p_is_active,
    tu_updated_at = now()
  WHERE tu_id = p_user_id;
  
  RETURN json_build_object('success', true);
END;
$$;

-- Function to update customer profile data
CREATE OR REPLACE FUNCTION admin_update_customer_profile(
  p_user_id uuid,
  p_first_name text,
  p_last_name text,
  p_username text,
  p_mobile text,
  p_gender text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
BEGIN
  -- Check if caller is an admin
  SELECT EXISTS (
    SELECT 1 FROM tbl_admin_users
    WHERE tau_auth_uid = auth.uid()
    AND tau_is_active = true
  ) INTO v_is_admin;
  
  IF NOT v_is_admin THEN
    RETURN json_build_object('success', false, 'error', 'Unauthorized');
  END IF;
  
  -- Update profile
  UPDATE tbl_user_profiles
  SET 
    tup_first_name = p_first_name,
    tup_last_name = p_last_name,
    tup_username = p_username,
    tup_mobile = p_mobile,
    tup_gender = p_gender,
    tup_updated_at = now()
  WHERE tup_user_id = p_user_id;
  
  RETURN json_build_object('success', true);
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION admin_update_customer_user TO authenticated;
GRANT EXECUTE ON FUNCTION admin_update_customer_profile TO authenticated;
