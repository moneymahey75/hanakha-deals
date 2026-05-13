/*
  # Fix Admin Authentication Password
  
  1. Purpose
    - Optionally updates the active super admin password in auth.users
    - Requires app.default_admin_password to be set for the migration session
    
  2. Security
    - Uses SECURITY DEFINER to bypass RLS
    - Only accessible with proper authentication
*/

-- Update the admin password in auth.users to match the expected password
-- This uses Supabase's internal password hashing
DO $$
DECLARE
  v_user_id uuid;
  v_default_password text := current_setting('app.default_admin_password', true);
BEGIN
  IF v_default_password IS NULL OR length(v_default_password) < 12 THEN
    RAISE NOTICE 'Skipping admin password update; app.default_admin_password is not set.';
    RETURN;
  END IF;

  -- Get the admin's auth user ID
  SELECT tau_auth_uid INTO v_user_id
  FROM tbl_admin_users
  WHERE tau_role = 'super_admin'
  AND tau_is_active = true
  LIMIT 1;

  IF v_user_id IS NOT NULL THEN
    -- Update password using Supabase's auth schema
    -- Note: Direct password update using crypt function
    UPDATE auth.users
    SET
      encrypted_password = extensions.crypt(v_default_password, extensions.gen_salt('bf')),
      updated_at = now()
    WHERE id = v_user_id;
    
    RAISE NOTICE 'Admin password updated successfully for user ID: %', v_user_id;
  ELSE
    RAISE NOTICE 'Admin user not found or not linked to auth.users';
  END IF;
END $$;
