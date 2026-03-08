/*
  # Fix All Recursive RLS Policies

  1. Changes
    - Fix tbl_admin_sessions policies to not check app_metadata (which may not exist during login)
    - Fix tbl_user_subscriptions to use security definer functions
    - Simplify all policies to avoid recursion
  
  2. Security
    - Users can only access their own records
    - Admin checks use security definer functions
    - Service role maintains full access
*/

-- Fix tbl_admin_sessions policies
DROP POLICY IF EXISTS "admin_select_own_sessions" ON tbl_admin_sessions;
DROP POLICY IF EXISTS "admin_insert_own_sessions" ON tbl_admin_sessions;
DROP POLICY IF EXISTS "admin_update_own_sessions" ON tbl_admin_sessions;
DROP POLICY IF EXISTS "admin_delete_own_sessions" ON tbl_admin_sessions;
DROP POLICY IF EXISTS "super_admin_full_access" ON tbl_admin_sessions;

CREATE POLICY "admin_select_own_sessions"
  ON tbl_admin_sessions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = tas_admin_id);

CREATE POLICY "admin_insert_own_sessions"
  ON tbl_admin_sessions
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = tas_admin_id);

CREATE POLICY "admin_update_own_sessions"
  ON tbl_admin_sessions
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = tas_admin_id)
  WITH CHECK (auth.uid() = tas_admin_id);

CREATE POLICY "admin_delete_own_sessions"
  ON tbl_admin_sessions
  FOR DELETE
  TO authenticated
  USING (auth.uid() = tas_admin_id);

CREATE POLICY "super_admin_full_access"
  ON tbl_admin_sessions
  FOR ALL
  TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- Fix tbl_user_subscriptions policies
DROP POLICY IF EXISTS "super_admin_full_access" ON tbl_user_subscriptions;
DROP POLICY IF EXISTS "sub_admin_select" ON tbl_user_subscriptions;
DROP POLICY IF EXISTS "sub_admin_update" ON tbl_user_subscriptions;
DROP POLICY IF EXISTS "sub_admin_insert" ON tbl_user_subscriptions;

CREATE POLICY "super_admin_full_access"
  ON tbl_user_subscriptions
  FOR ALL
  TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

CREATE POLICY "sub_admin_select"
  ON tbl_user_subscriptions
  FOR SELECT
  TO authenticated
  USING (is_sub_admin());

CREATE POLICY "sub_admin_update"
  ON tbl_user_subscriptions
  FOR UPDATE
  TO authenticated
  USING (is_sub_admin())
  WITH CHECK (is_sub_admin());

CREATE POLICY "sub_admin_insert"
  ON tbl_user_subscriptions
  FOR INSERT
  TO authenticated
  WITH CHECK (is_sub_admin());

-- Ensure user policies exist
DROP POLICY IF EXISTS "user_select_own" ON tbl_user_subscriptions;
DROP POLICY IF EXISTS "user_insert_own" ON tbl_user_subscriptions;
DROP POLICY IF EXISTS "user_update_own" ON tbl_user_subscriptions;

CREATE POLICY "user_select_own"
  ON tbl_user_subscriptions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = tus_user_id);

CREATE POLICY "user_insert_own"
  ON tbl_user_subscriptions
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = tus_user_id);

CREATE POLICY "user_update_own"
  ON tbl_user_subscriptions
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = tus_user_id)
  WITH CHECK (auth.uid() = tus_user_id);
