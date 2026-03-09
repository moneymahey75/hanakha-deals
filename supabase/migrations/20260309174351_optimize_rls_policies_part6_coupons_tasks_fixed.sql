/*
  # Optimize RLS Policies - Part 6: Coupons and Tasks (Fixed)

  1. Performance Improvements
    - Replace `auth.uid()` with `(select auth.uid())` in all RLS policies
    
  2. Tables Updated
    - tbl_coupons
    - tbl_daily_tasks
    - tbl_user_tasks
    - tbl_coupon_shares
    - tbl_coupon_interactions
*/

-- tbl_coupons policies
DROP POLICY IF EXISTS "owner_insert_own" ON tbl_coupons;
CREATE POLICY "owner_insert_own" ON tbl_coupons
  FOR INSERT
  TO authenticated, anon
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM tbl_companies
      WHERE tc_id = tbl_coupons.tc_company_id
      AND tc_user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "owner_select_own" ON tbl_coupons;
CREATE POLICY "owner_select_own" ON tbl_coupons
  FOR SELECT
  TO authenticated, anon
  USING (
    EXISTS (
      SELECT 1 FROM tbl_companies
      WHERE tc_id = tbl_coupons.tc_company_id
      AND tc_user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "owner_update_own" ON tbl_coupons;
CREATE POLICY "owner_update_own" ON tbl_coupons
  FOR UPDATE
  TO authenticated, anon
  USING (
    EXISTS (
      SELECT 1 FROM tbl_companies
      WHERE tc_id = tbl_coupons.tc_company_id
      AND tc_user_id = (select auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM tbl_companies
      WHERE tc_id = tbl_coupons.tc_company_id
      AND tc_user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "service_role_full_access" ON tbl_coupons;
CREATE POLICY "service_role_full_access" ON tbl_coupons
  FOR ALL
  TO authenticated, anon
  USING ((select current_setting('request.jwt.claims', true)::json->>'role') = 'service_role');

-- tbl_daily_tasks policies
DROP POLICY IF EXISTS "service_role_full_access" ON tbl_daily_tasks;
CREATE POLICY "service_role_full_access" ON tbl_daily_tasks
  FOR ALL
  TO authenticated, anon
  USING ((select current_setting('request.jwt.claims', true)::json->>'role') = 'service_role');

-- tbl_user_tasks policies
DROP POLICY IF EXISTS "service_role_full_access" ON tbl_user_tasks;
CREATE POLICY "service_role_full_access" ON tbl_user_tasks
  FOR ALL
  TO authenticated, anon
  USING ((select current_setting('request.jwt.claims', true)::json->>'role') = 'service_role');

DROP POLICY IF EXISTS "user_insert_own" ON tbl_user_tasks;
CREATE POLICY "user_insert_own" ON tbl_user_tasks
  FOR INSERT
  TO authenticated, anon
  WITH CHECK ((select auth.uid()) = tut_user_id);

DROP POLICY IF EXISTS "user_select_own" ON tbl_user_tasks;
CREATE POLICY "user_select_own" ON tbl_user_tasks
  FOR SELECT
  TO authenticated, anon
  USING ((select auth.uid()) = tut_user_id);

DROP POLICY IF EXISTS "user_update_own" ON tbl_user_tasks;
CREATE POLICY "user_update_own" ON tbl_user_tasks
  FOR UPDATE
  TO authenticated, anon
  USING ((select auth.uid()) = tut_user_id)
  WITH CHECK ((select auth.uid()) = tut_user_id);

-- tbl_coupon_shares policies
DROP POLICY IF EXISTS "service_role_full_access" ON tbl_coupon_shares;
CREATE POLICY "service_role_full_access" ON tbl_coupon_shares
  FOR ALL
  TO authenticated, anon
  USING ((select current_setting('request.jwt.claims', true)::json->>'role') = 'service_role');

DROP POLICY IF EXISTS "user_insert_own" ON tbl_coupon_shares;
CREATE POLICY "user_insert_own" ON tbl_coupon_shares
  FOR INSERT
  TO authenticated, anon
  WITH CHECK ((select auth.uid()) = tcs_user_id);

DROP POLICY IF EXISTS "user_select_own" ON tbl_coupon_shares;
CREATE POLICY "user_select_own" ON tbl_coupon_shares
  FOR SELECT
  TO authenticated, anon
  USING ((select auth.uid()) = tcs_user_id);

-- tbl_coupon_interactions policies
DROP POLICY IF EXISTS "anon_insert" ON tbl_coupon_interactions;
CREATE POLICY "anon_insert" ON tbl_coupon_interactions
  FOR INSERT
  TO anon
  WITH CHECK ((select auth.role()) = 'anon');

DROP POLICY IF EXISTS "anon_select" ON tbl_coupon_interactions;
CREATE POLICY "anon_select" ON tbl_coupon_interactions
  FOR SELECT
  TO anon
  USING ((select auth.role()) = 'anon');

DROP POLICY IF EXISTS "service_role_full_access" ON tbl_coupon_interactions;
CREATE POLICY "service_role_full_access" ON tbl_coupon_interactions
  FOR ALL
  TO authenticated, anon
  USING ((select current_setting('request.jwt.claims', true)::json->>'role') = 'service_role');

DROP POLICY IF EXISTS "user_delete_own" ON tbl_coupon_interactions;
CREATE POLICY "user_delete_own" ON tbl_coupon_interactions
  FOR DELETE
  TO authenticated, anon
  USING ((select auth.uid()) = tci_user_id);

DROP POLICY IF EXISTS "user_insert_own" ON tbl_coupon_interactions;
CREATE POLICY "user_insert_own" ON tbl_coupon_interactions
  FOR INSERT
  TO authenticated, anon
  WITH CHECK ((select auth.uid()) = tci_user_id);

DROP POLICY IF EXISTS "user_select_own" ON tbl_coupon_interactions;
CREATE POLICY "user_select_own" ON tbl_coupon_interactions
  FOR SELECT
  TO authenticated, anon
  USING ((select auth.uid()) = tci_user_id);

DROP POLICY IF EXISTS "user_update_own" ON tbl_coupon_interactions;
CREATE POLICY "user_update_own" ON tbl_coupon_interactions
  FOR UPDATE
  TO authenticated, anon
  USING ((select auth.uid()) = tci_user_id)
  WITH CHECK ((select auth.uid()) = tci_user_id);