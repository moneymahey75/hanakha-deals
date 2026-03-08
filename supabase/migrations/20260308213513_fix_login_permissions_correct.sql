/*
  # Fix Login Permission Issues - Corrected

  1. Changes
    - Allow authenticated users to read their own admin records during login
    - Fix tbl_user_profiles policies to use security definer functions
    - Fix tbl_users policies with correct column names
    - Simplify policies to avoid recursion
  
  2. Security
    - Users can only see their own records
    - Admin checks use security definer functions
    - Critical fields remain protected
*/

-- Drop problematic policies on tbl_user_profiles
DROP POLICY IF EXISTS "super_admin_full_access" ON tbl_user_profiles;
DROP POLICY IF EXISTS "sub_admin_select" ON tbl_user_profiles;
DROP POLICY IF EXISTS "sub_admin_update" ON tbl_user_profiles;

-- Recreate tbl_user_profiles policies using security definer functions
CREATE POLICY "super_admin_full_access"
  ON tbl_user_profiles
  FOR ALL
  TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

CREATE POLICY "sub_admin_select"
  ON tbl_user_profiles
  FOR SELECT
  TO authenticated
  USING (is_sub_admin());

CREATE POLICY "sub_admin_update"
  ON tbl_user_profiles
  FOR UPDATE
  TO authenticated
  USING (is_sub_admin())
  WITH CHECK (is_sub_admin());

-- Ensure users can read their own profiles (needed for login context)
DROP POLICY IF EXISTS "user_select_own" ON tbl_user_profiles;
CREATE POLICY "user_select_own"
  ON tbl_user_profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = tup_user_id);

DROP POLICY IF EXISTS "user_insert_own" ON tbl_user_profiles;
CREATE POLICY "user_insert_own"
  ON tbl_user_profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = tup_user_id AND tup_is_default_parent = false);

DROP POLICY IF EXISTS "user_update_own" ON tbl_user_profiles;
CREATE POLICY "user_update_own"
  ON tbl_user_profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = tup_user_id)
  WITH CHECK (auth.uid() = tup_user_id);

-- Update tbl_admin_users to allow admins to read their own record during login
DROP POLICY IF EXISTS "admin_select_own" ON tbl_admin_users;
CREATE POLICY "admin_select_own"
  ON tbl_admin_users
  FOR SELECT
  TO authenticated
  USING (tau_auth_uid = auth.uid());

-- Allow admins to update their own non-critical fields
DROP POLICY IF EXISTS "admin_update_own" ON tbl_admin_users;
CREATE POLICY "admin_update_own"
  ON tbl_admin_users
  FOR UPDATE
  TO authenticated
  USING (tau_auth_uid = auth.uid())
  WITH CHECK (
    tau_auth_uid = auth.uid() 
    AND tau_role = (SELECT tau_role FROM tbl_admin_users WHERE tau_auth_uid = auth.uid())
  );

DROP POLICY IF EXISTS "admin_insert_own" ON tbl_admin_users;
DROP POLICY IF EXISTS "admin_delete_own" ON tbl_admin_users;

-- Ensure tbl_users has proper policies for login
DROP POLICY IF EXISTS "user_select_own" ON tbl_users;
CREATE POLICY "user_select_own"
  ON tbl_users
  FOR SELECT
  TO authenticated
  USING (auth.uid() = tu_id);

DROP POLICY IF EXISTS "user_update_own" ON tbl_users;
CREATE POLICY "user_update_own"
  ON tbl_users
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = tu_id)
  WITH CHECK (auth.uid() = tu_id AND tu_user_type != 'admin');

DROP POLICY IF EXISTS "user_insert_own" ON tbl_users;
CREATE POLICY "user_insert_own"
  ON tbl_users
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = tu_id);
