/*
  # Optimize RLS Policies - Part 2: Companies and MLM

  1. Performance Improvements
    - Replace `auth.uid()` with `(select auth.uid())` in all RLS policies
    
  2. Tables Updated
    - tbl_companies
    - tbl_mlm_tree
*/

-- tbl_companies policies
DROP POLICY IF EXISTS "service_role_full_access" ON tbl_companies;
CREATE POLICY "service_role_full_access" ON tbl_companies
  FOR ALL
  TO authenticated, anon
  USING ((select current_setting('request.jwt.claims', true)::json->>'role') = 'service_role');

DROP POLICY IF EXISTS "user_insert_own" ON tbl_companies;
CREATE POLICY "user_insert_own" ON tbl_companies
  FOR INSERT
  TO authenticated, anon
  WITH CHECK ((select auth.uid()) = tc_user_id);

DROP POLICY IF EXISTS "user_select_own" ON tbl_companies;
CREATE POLICY "user_select_own" ON tbl_companies
  FOR SELECT
  TO authenticated, anon
  USING ((select auth.uid()) = tc_user_id);

DROP POLICY IF EXISTS "user_update_own" ON tbl_companies;
CREATE POLICY "user_update_own" ON tbl_companies
  FOR UPDATE
  TO authenticated, anon
  USING ((select auth.uid()) = tc_user_id)
  WITH CHECK ((select auth.uid()) = tc_user_id);

-- tbl_mlm_tree policies
DROP POLICY IF EXISTS "service_role_full_access" ON tbl_mlm_tree;
CREATE POLICY "service_role_full_access" ON tbl_mlm_tree
  FOR ALL
  TO authenticated, anon
  USING ((select current_setting('request.jwt.claims', true)::json->>'role') = 'service_role');

DROP POLICY IF EXISTS "user_delete_own" ON tbl_mlm_tree;
CREATE POLICY "user_delete_own" ON tbl_mlm_tree
  FOR DELETE
  TO authenticated, anon
  USING ((select auth.uid()) = tmt_user_id);

DROP POLICY IF EXISTS "user_insert_own" ON tbl_mlm_tree;
CREATE POLICY "user_insert_own" ON tbl_mlm_tree
  FOR INSERT
  TO authenticated, anon
  WITH CHECK ((select auth.uid()) = tmt_user_id);

DROP POLICY IF EXISTS "user_select_all" ON tbl_mlm_tree;
CREATE POLICY "user_select_all" ON tbl_mlm_tree
  FOR SELECT
  TO authenticated, anon
  USING (true);

DROP POLICY IF EXISTS "user_update_own" ON tbl_mlm_tree;
CREATE POLICY "user_update_own" ON tbl_mlm_tree
  FOR UPDATE
  TO authenticated, anon
  USING ((select auth.uid()) = tmt_user_id)
  WITH CHECK ((select auth.uid()) = tmt_user_id);