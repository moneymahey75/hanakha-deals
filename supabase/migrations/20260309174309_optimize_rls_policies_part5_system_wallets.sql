/*
  # Optimize RLS Policies - Part 5: System Settings and Wallets

  1. Performance Improvements
    - Replace `auth.uid()` with `(select auth.uid())` in all RLS policies
    
  2. Tables Updated
    - tbl_email_templates
    - tbl_system_settings
    - tbl_wallets
    - tbl_wallet_transactions
*/

-- tbl_email_templates policies
DROP POLICY IF EXISTS "service_role_full_access" ON tbl_email_templates;
CREATE POLICY "service_role_full_access" ON tbl_email_templates
  FOR ALL
  TO authenticated
  USING ((select current_setting('request.jwt.claims', true)::json->>'role') = 'service_role');

-- tbl_system_settings policies
DROP POLICY IF EXISTS "service_role_full_access" ON tbl_system_settings;
CREATE POLICY "service_role_full_access" ON tbl_system_settings
  FOR ALL
  TO authenticated, anon
  USING ((select current_setting('request.jwt.claims', true)::json->>'role') = 'service_role');

-- tbl_wallets policies
DROP POLICY IF EXISTS "service_role_full_access" ON tbl_wallets;
CREATE POLICY "service_role_full_access" ON tbl_wallets
  FOR ALL
  TO authenticated, anon
  USING ((select current_setting('request.jwt.claims', true)::json->>'role') = 'service_role');

DROP POLICY IF EXISTS "user_insert_own" ON tbl_wallets;
CREATE POLICY "user_insert_own" ON tbl_wallets
  FOR INSERT
  TO authenticated, anon
  WITH CHECK ((select auth.uid()) = tw_user_id);

DROP POLICY IF EXISTS "user_select_own" ON tbl_wallets;
CREATE POLICY "user_select_own" ON tbl_wallets
  FOR SELECT
  TO authenticated, anon
  USING ((select auth.uid()) = tw_user_id);

-- tbl_wallet_transactions policies
DROP POLICY IF EXISTS "service_role_full_access" ON tbl_wallet_transactions;
CREATE POLICY "service_role_full_access" ON tbl_wallet_transactions
  FOR ALL
  TO authenticated, anon
  USING ((select current_setting('request.jwt.claims', true)::json->>'role') = 'service_role');

DROP POLICY IF EXISTS "user_select_own" ON tbl_wallet_transactions;
CREATE POLICY "user_select_own" ON tbl_wallet_transactions
  FOR SELECT
  TO authenticated, anon
  USING ((select auth.uid()) = twt_user_id);