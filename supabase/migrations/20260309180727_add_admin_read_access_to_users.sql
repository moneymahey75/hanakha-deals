/*
  # Add Admin Read Access to User Tables

  1. Changes
    - Add policy to allow admins to read tbl_users
    - Add policy to allow admins to read tbl_user_profiles
    
  2. Security
    - Admins can only read user data, not modify it
    - Uses auth.uid() to verify admin is logged in via tau_auth_uid
*/

-- Allow admins to read tbl_users
DROP POLICY IF EXISTS "admin_read_users" ON tbl_users;
CREATE POLICY "admin_read_users" ON tbl_users
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tbl_admin_users
      WHERE tau_auth_uid = (select auth.uid())
      AND tau_is_active = true
    )
  );

-- Allow admins to read tbl_user_profiles
DROP POLICY IF EXISTS "admin_read_user_profiles" ON tbl_user_profiles;
CREATE POLICY "admin_read_user_profiles" ON tbl_user_profiles
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tbl_admin_users
      WHERE tau_auth_uid = (select auth.uid())
      AND tau_is_active = true
    )
  );
