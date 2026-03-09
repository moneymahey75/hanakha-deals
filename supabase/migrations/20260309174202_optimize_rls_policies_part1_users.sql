/*
  # Optimize RLS Policies - Part 1: Users Tables

  1. Performance Improvements
    - Replace `auth.uid()` with `(select auth.uid())` in all RLS policies
    - This prevents re-evaluation of auth functions for each row
    - Significantly improves query performance at scale
    
  2. Tables Updated
    - tbl_users
    - tbl_user_profiles
*/

-- tbl_users policies
DROP POLICY IF EXISTS "service_role_full_access" ON tbl_users;
CREATE POLICY "service_role_full_access" ON tbl_users
  FOR ALL
  TO authenticated, anon
  USING ((select current_setting('request.jwt.claims', true)::json->>'role') = 'service_role');

DROP POLICY IF EXISTS "user_insert_own" ON tbl_users;
CREATE POLICY "user_insert_own" ON tbl_users
  FOR INSERT
  TO authenticated, anon
  WITH CHECK ((select auth.uid()) = tu_id);

DROP POLICY IF EXISTS "user_select_active_others" ON tbl_users;
CREATE POLICY "user_select_active_others" ON tbl_users
  FOR SELECT
  TO authenticated, anon
  USING (tu_is_active = true OR (select auth.uid()) = tu_id);

DROP POLICY IF EXISTS "user_select_own" ON tbl_users;
CREATE POLICY "user_select_own" ON tbl_users
  FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = tu_id);

DROP POLICY IF EXISTS "user_update_own" ON tbl_users;
CREATE POLICY "user_update_own" ON tbl_users
  FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) = tu_id)
  WITH CHECK ((select auth.uid()) = tu_id);

-- tbl_user_profiles policies
DROP POLICY IF EXISTS "service_role_full_access" ON tbl_user_profiles;
CREATE POLICY "service_role_full_access" ON tbl_user_profiles
  FOR ALL
  TO authenticated, anon
  USING ((select current_setting('request.jwt.claims', true)::json->>'role') = 'service_role');

DROP POLICY IF EXISTS "user_insert_own" ON tbl_user_profiles;
CREATE POLICY "user_insert_own" ON tbl_user_profiles
  FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = tup_user_id);

DROP POLICY IF EXISTS "user_select_others_mlm" ON tbl_user_profiles;
CREATE POLICY "user_select_others_mlm" ON tbl_user_profiles
  FOR SELECT
  TO authenticated, anon
  USING (
    EXISTS (
      SELECT 1 FROM tbl_mlm_tree t
      WHERE t.tmt_user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "user_select_own" ON tbl_user_profiles;
CREATE POLICY "user_select_own" ON tbl_user_profiles
  FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = tup_user_id);

DROP POLICY IF EXISTS "user_update_own" ON tbl_user_profiles;
CREATE POLICY "user_update_own" ON tbl_user_profiles
  FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) = tup_user_id)
  WITH CHECK ((select auth.uid()) = tup_user_id);