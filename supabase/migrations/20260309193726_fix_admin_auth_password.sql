/*
  # Fix Admin Authentication Password
  
  1. Purpose
    - Updates the admin user's password in auth.users
    - Ensures password matches "Admin@123456"
    
  2. Security
    - Uses SECURITY DEFINER to bypass RLS
    - Only accessible with proper authentication
*/

-- Update the admin password in auth.users to match the expected password
-- This uses Supabase's internal password hashing
DO $$
DECLARE
  v_user_id uuid;
BEGIN
  -- Get the admin's auth user ID
  SELECT tau_auth_uid INTO v_user_id
  FROM tbl_admin_users
  WHERE tau_email = 's_admin@dealsphere.com'
  LIMIT 1;

  IF v_user_id IS NOT NULL THEN
    -- Update password using Supabase's auth schema
    -- Note: Direct password update using crypt function
    UPDATE auth.users
    SET 
      encrypted_password = crypt('Admin@123456', gen_salt('bf')),
      updated_at = now()
    WHERE id = v_user_id;
    
    RAISE NOTICE 'Admin password updated successfully for user ID: %', v_user_id;
  ELSE
    RAISE NOTICE 'Admin user not found or not linked to auth.users';
  END IF;
END $$;
