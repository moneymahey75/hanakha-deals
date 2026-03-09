/*
  # Fix Admin Permissions - Remove Conflicting Policies
  
  1. Changes
    - Remove conflicting restrictive policies
    - Keep only the correct admin policies
    - Grant proper UPDATE permissions to both super and sub admins
    
  2. Security
    - Admins can update all user records
    - Maintains authentication requirement
*/

-- Remove the conflicting restrictive policy
DROP POLICY IF EXISTS "sub_admin_update" ON tbl_users;

-- The correct policies are already in place from previous migration:
-- super_admin_full_access, super_admin_update_users, super_admin_delete_users
-- sub_admin_update_users

-- Just to be safe, let's recreate them with correct logic
DROP POLICY IF EXISTS "super_admin_full_access" ON tbl_users;
CREATE POLICY "super_admin_full_access" ON tbl_users
  FOR ALL
  TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS "sub_admin_update_users" ON tbl_users;
CREATE POLICY "sub_admin_update_users" ON tbl_users
  FOR UPDATE
  TO authenticated
  USING (is_sub_admin())
  WITH CHECK (is_sub_admin());

DROP POLICY IF EXISTS "sub_admin_delete_users" ON tbl_users;
CREATE POLICY "sub_admin_delete_users" ON tbl_users
  FOR DELETE
  TO authenticated
  USING (is_sub_admin());

-- Also fix user_profiles
DROP POLICY IF EXISTS "sub_admin_update" ON tbl_user_profiles;
DROP POLICY IF EXISTS "sub_admin_update_profiles" ON tbl_user_profiles;
CREATE POLICY "sub_admin_update_profiles" ON tbl_user_profiles
  FOR UPDATE
  TO authenticated
  USING (is_sub_admin())
  WITH CHECK (is_sub_admin());

DROP POLICY IF EXISTS "super_admin_full_access" ON tbl_user_profiles;
CREATE POLICY "super_admin_full_access" ON tbl_user_profiles
  FOR ALL
  TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());
