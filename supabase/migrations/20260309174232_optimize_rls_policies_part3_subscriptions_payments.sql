/*
  # Optimize RLS Policies - Part 3: Subscriptions and Payments

  1. Performance Improvements
    - Replace `auth.uid()` with `(select auth.uid())` in all RLS policies
    
  2. Tables Updated
    - tbl_subscription_plans
    - tbl_user_subscriptions
    - tbl_payments
    - tbl_otp_verifications
*/

-- tbl_subscription_plans policies
DROP POLICY IF EXISTS "service_role_full_access" ON tbl_subscription_plans;
CREATE POLICY "service_role_full_access" ON tbl_subscription_plans
  FOR ALL
  TO authenticated, anon
  USING ((select current_setting('request.jwt.claims', true)::json->>'role') = 'service_role');

-- tbl_user_subscriptions policies
DROP POLICY IF EXISTS "service_role_full_access" ON tbl_user_subscriptions;
CREATE POLICY "service_role_full_access" ON tbl_user_subscriptions
  FOR ALL
  TO authenticated
  USING ((select current_setting('request.jwt.claims', true)::json->>'role') = 'service_role');

DROP POLICY IF EXISTS "user_insert_own" ON tbl_user_subscriptions;
CREATE POLICY "user_insert_own" ON tbl_user_subscriptions
  FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = tus_user_id);

DROP POLICY IF EXISTS "user_select_own" ON tbl_user_subscriptions;
CREATE POLICY "user_select_own" ON tbl_user_subscriptions
  FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = tus_user_id);

DROP POLICY IF EXISTS "user_update_own" ON tbl_user_subscriptions;
CREATE POLICY "user_update_own" ON tbl_user_subscriptions
  FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) = tus_user_id)
  WITH CHECK ((select auth.uid()) = tus_user_id);

-- tbl_payments policies
DROP POLICY IF EXISTS "service_role_full_access" ON tbl_payments;
CREATE POLICY "service_role_full_access" ON tbl_payments
  FOR ALL
  TO authenticated, anon
  USING ((select current_setting('request.jwt.claims', true)::json->>'role') = 'service_role');

DROP POLICY IF EXISTS "user_insert_own" ON tbl_payments;
CREATE POLICY "user_insert_own" ON tbl_payments
  FOR INSERT
  TO authenticated, anon
  WITH CHECK ((select auth.uid()) = tp_user_id);

DROP POLICY IF EXISTS "user_select_own" ON tbl_payments;
CREATE POLICY "user_select_own" ON tbl_payments
  FOR SELECT
  TO authenticated, anon
  USING ((select auth.uid()) = tp_user_id);

DROP POLICY IF EXISTS "user_update_own" ON tbl_payments;
CREATE POLICY "user_update_own" ON tbl_payments
  FOR UPDATE
  TO authenticated, anon
  USING ((select auth.uid()) = tp_user_id)
  WITH CHECK ((select auth.uid()) = tp_user_id);

-- tbl_otp_verifications policies
DROP POLICY IF EXISTS "service_role_full_access" ON tbl_otp_verifications;
CREATE POLICY "service_role_full_access" ON tbl_otp_verifications
  FOR ALL
  TO authenticated, anon
  USING ((select current_setting('request.jwt.claims', true)::json->>'role') = 'service_role');

DROP POLICY IF EXISTS "user_insert_own" ON tbl_otp_verifications;
CREATE POLICY "user_insert_own" ON tbl_otp_verifications
  FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = tov_user_id);

DROP POLICY IF EXISTS "user_select_own" ON tbl_otp_verifications;
CREATE POLICY "user_select_own" ON tbl_otp_verifications
  FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = tov_user_id);

DROP POLICY IF EXISTS "user_update_own" ON tbl_otp_verifications;
CREATE POLICY "user_update_own" ON tbl_otp_verifications
  FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) = tov_user_id)
  WITH CHECK ((select auth.uid()) = tov_user_id);