/*
  # Optimize RLS Policies - Part 7: Wallet Connections, Social Shares, and Earning Distribution

  1. Performance Improvements
    - Replace `auth.uid()` with `(select auth.uid())` in all RLS policies
    
  2. Tables Updated
    - tbl_user_wallet_connections
    - earning_distribution_settings
    - tbl_social_shares
*/

-- tbl_user_wallet_connections policies
DROP POLICY IF EXISTS "service_role_full_access" ON tbl_user_wallet_connections;
CREATE POLICY "service_role_full_access" ON tbl_user_wallet_connections
  FOR ALL
  TO authenticated, anon
  USING ((select current_setting('request.jwt.claims', true)::json->>'role') = 'service_role');

DROP POLICY IF EXISTS "user_delete_own" ON tbl_user_wallet_connections;
CREATE POLICY "user_delete_own" ON tbl_user_wallet_connections
  FOR DELETE
  TO authenticated, anon
  USING ((select auth.uid()) = tuwc_user_id);

DROP POLICY IF EXISTS "user_insert_own" ON tbl_user_wallet_connections;
CREATE POLICY "user_insert_own" ON tbl_user_wallet_connections
  FOR INSERT
  TO authenticated, anon
  WITH CHECK ((select auth.uid()) = tuwc_user_id);

DROP POLICY IF EXISTS "user_select_own" ON tbl_user_wallet_connections;
CREATE POLICY "user_select_own" ON tbl_user_wallet_connections
  FOR SELECT
  TO authenticated, anon
  USING ((select auth.uid()) = tuwc_user_id);

DROP POLICY IF EXISTS "user_update_own" ON tbl_user_wallet_connections;
CREATE POLICY "user_update_own" ON tbl_user_wallet_connections
  FOR UPDATE
  TO authenticated, anon
  USING ((select auth.uid()) = tuwc_user_id)
  WITH CHECK ((select auth.uid()) = tuwc_user_id);

-- earning_distribution_settings policies
DROP POLICY IF EXISTS "admin_delete" ON earning_distribution_settings;
CREATE POLICY "admin_delete" ON earning_distribution_settings
  FOR DELETE
  TO authenticated, anon
  USING (
    EXISTS (
      SELECT 1 FROM tbl_admin_users
      WHERE tau_auth_uid = (select auth.uid())
      AND tau_is_active = true
    )
  );

DROP POLICY IF EXISTS "admin_insert" ON earning_distribution_settings;
CREATE POLICY "admin_insert" ON earning_distribution_settings
  FOR INSERT
  TO authenticated, anon
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM tbl_admin_users
      WHERE tau_auth_uid = (select auth.uid())
      AND tau_is_active = true
    )
  );

DROP POLICY IF EXISTS "admin_select" ON earning_distribution_settings;
CREATE POLICY "admin_select" ON earning_distribution_settings
  FOR SELECT
  TO authenticated, anon
  USING (
    EXISTS (
      SELECT 1 FROM tbl_admin_users
      WHERE tau_auth_uid = (select auth.uid())
      AND tau_is_active = true
    )
  );

DROP POLICY IF EXISTS "admin_update" ON earning_distribution_settings;
CREATE POLICY "admin_update" ON earning_distribution_settings
  FOR UPDATE
  TO authenticated, anon
  USING (
    EXISTS (
      SELECT 1 FROM tbl_admin_users
      WHERE tau_auth_uid = (select auth.uid())
      AND tau_is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM tbl_admin_users
      WHERE tau_auth_uid = (select auth.uid())
      AND tau_is_active = true
    )
  );

DROP POLICY IF EXISTS "service_role_full_access" ON earning_distribution_settings;
CREATE POLICY "service_role_full_access" ON earning_distribution_settings
  FOR ALL
  TO authenticated, anon
  USING ((select current_setting('request.jwt.claims', true)::json->>'role') = 'service_role');

-- tbl_social_shares policies
DROP POLICY IF EXISTS "service_role_full_access" ON tbl_social_shares;
CREATE POLICY "service_role_full_access" ON tbl_social_shares
  FOR ALL
  TO authenticated, anon
  USING ((select current_setting('request.jwt.claims', true)::json->>'role') = 'service_role');

DROP POLICY IF EXISTS "user_insert_own" ON tbl_social_shares;
CREATE POLICY "user_insert_own" ON tbl_social_shares
  FOR INSERT
  TO authenticated, anon
  WITH CHECK ((select auth.uid()) = tss_user_id);

DROP POLICY IF EXISTS "user_select_own" ON tbl_social_shares;
CREATE POLICY "user_select_own" ON tbl_social_shares
  FOR SELECT
  TO authenticated, anon
  USING ((select auth.uid()) = tss_user_id);

DROP POLICY IF EXISTS "user_update_own" ON tbl_social_shares;
CREATE POLICY "user_update_own" ON tbl_social_shares
  FOR UPDATE
  TO authenticated, anon
  USING ((select auth.uid()) = tss_user_id)
  WITH CHECK ((select auth.uid()) = tss_user_id);