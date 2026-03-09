/*
  # Fix Admin Access to User Tables
  
  1. Changes
    - Drop the recursive admin_read policies
    - Ensure admin functions work correctly
    - Add simplified policies using existing functions
    
  2. Security
    - Uses existing is_super_admin() and is_sub_admin() functions
    - Admins can read all user data
    - Maintains separation of concerns
*/

-- Drop the potentially problematic policies
DROP POLICY IF EXISTS "admin_read_users" ON tbl_users;
DROP POLICY IF EXISTS "admin_read_user_profiles" ON tbl_user_profiles;

-- Ensure super_admin has full access to tbl_users
DROP POLICY IF EXISTS "super_admin_full_access_users" ON tbl_users;
CREATE POLICY "super_admin_full_access_users" ON tbl_users
  FOR ALL
  TO authenticated
  USING (is_super_admin());

-- Ensure sub_admin can read tbl_users
DROP POLICY IF EXISTS "sub_admin_select_users" ON tbl_users;
CREATE POLICY "sub_admin_select_users" ON tbl_users
  FOR SELECT
  TO authenticated
  USING (is_sub_admin());
