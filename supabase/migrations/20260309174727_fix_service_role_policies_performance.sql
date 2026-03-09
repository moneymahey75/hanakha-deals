/*
  # Fix Service Role RLS Policy Performance

  1. Performance Improvements
    - Replace current_setting() checks with subquery approach
    - Prevents re-evaluation for each row
    
  2. Approach
    - Use (select current_setting(...)) instead of current_setting(...)
    - This caches the result for the entire query
*/

-- tbl_users
DROP POLICY IF EXISTS "service_role_full_access" ON tbl_users;
CREATE POLICY "service_role_full_access" ON tbl_users
  FOR ALL
  TO authenticated, anon
  USING ((select current_setting('request.jwt.claims', true)::json->>'role') = 'service_role');

-- tbl_user_profiles
DROP POLICY IF EXISTS "service_role_full_access" ON tbl_user_profiles;
CREATE POLICY "service_role_full_access" ON tbl_user_profiles
  FOR ALL
  TO authenticated, anon
  USING ((select current_setting('request.jwt.claims', true)::json->>'role') = 'service_role');

-- tbl_companies
DROP POLICY IF EXISTS "service_role_full_access" ON tbl_companies;
CREATE POLICY "service_role_full_access" ON tbl_companies
  FOR ALL
  TO authenticated, anon
  USING ((select current_setting('request.jwt.claims', true)::json->>'role') = 'service_role');

-- tbl_mlm_tree
DROP POLICY IF EXISTS "service_role_full_access" ON tbl_mlm_tree;
CREATE POLICY "service_role_full_access" ON tbl_mlm_tree
  FOR ALL
  TO authenticated, anon
  USING ((select current_setting('request.jwt.claims', true)::json->>'role') = 'service_role');

-- tbl_subscription_plans
DROP POLICY IF EXISTS "service_role_full_access" ON tbl_subscription_plans;
CREATE POLICY "service_role_full_access" ON tbl_subscription_plans
  FOR ALL
  TO authenticated, anon
  USING ((select current_setting('request.jwt.claims', true)::json->>'role') = 'service_role');

-- tbl_user_subscriptions
DROP POLICY IF EXISTS "service_role_full_access" ON tbl_user_subscriptions;
CREATE POLICY "service_role_full_access" ON tbl_user_subscriptions
  FOR ALL
  TO authenticated
  USING ((select current_setting('request.jwt.claims', true)::json->>'role') = 'service_role');

-- tbl_payments
DROP POLICY IF EXISTS "service_role_full_access" ON tbl_payments;
CREATE POLICY "service_role_full_access" ON tbl_payments
  FOR ALL
  TO authenticated, anon
  USING ((select current_setting('request.jwt.claims', true)::json->>'role') = 'service_role');

-- tbl_otp_verifications
DROP POLICY IF EXISTS "service_role_full_access" ON tbl_otp_verifications;
CREATE POLICY "service_role_full_access" ON tbl_otp_verifications
  FOR ALL
  TO authenticated, anon
  USING ((select current_setting('request.jwt.claims', true)::json->>'role') = 'service_role');

-- tbl_user_activity_logs
DROP POLICY IF EXISTS "service_role_full_access" ON tbl_user_activity_logs;
CREATE POLICY "service_role_full_access" ON tbl_user_activity_logs
  FOR ALL
  TO authenticated, anon
  USING ((select current_setting('request.jwt.claims', true)::json->>'role') = 'service_role');

-- tbl_admin_users
DROP POLICY IF EXISTS "service_role_full_access" ON tbl_admin_users;
CREATE POLICY "service_role_full_access" ON tbl_admin_users
  FOR ALL
  TO authenticated
  USING ((select current_setting('request.jwt.claims', true)::json->>'role') = 'service_role');

-- tbl_admin_sessions
DROP POLICY IF EXISTS "service_role_full_access" ON tbl_admin_sessions;
CREATE POLICY "service_role_full_access" ON tbl_admin_sessions
  FOR ALL
  TO authenticated
  USING ((select current_setting('request.jwt.claims', true)::json->>'role') = 'service_role');

-- tbl_admin_activity_logs
DROP POLICY IF EXISTS "service_role_full_access" ON tbl_admin_activity_logs;
CREATE POLICY "service_role_full_access" ON tbl_admin_activity_logs
  FOR ALL
  TO authenticated, anon
  USING ((select current_setting('request.jwt.claims', true)::json->>'role') = 'service_role');

-- tbl_email_templates
DROP POLICY IF EXISTS "service_role_full_access" ON tbl_email_templates;
CREATE POLICY "service_role_full_access" ON tbl_email_templates
  FOR ALL
  TO authenticated
  USING ((select current_setting('request.jwt.claims', true)::json->>'role') = 'service_role');

-- tbl_system_settings
DROP POLICY IF EXISTS "service_role_full_access" ON tbl_system_settings;
CREATE POLICY "service_role_full_access" ON tbl_system_settings
  FOR ALL
  TO authenticated, anon
  USING ((select current_setting('request.jwt.claims', true)::json->>'role') = 'service_role');

-- tbl_wallets
DROP POLICY IF EXISTS "service_role_full_access" ON tbl_wallets;
CREATE POLICY "service_role_full_access" ON tbl_wallets
  FOR ALL
  TO authenticated, anon
  USING ((select current_setting('request.jwt.claims', true)::json->>'role') = 'service_role');

-- tbl_wallet_transactions
DROP POLICY IF EXISTS "service_role_full_access" ON tbl_wallet_transactions;
CREATE POLICY "service_role_full_access" ON tbl_wallet_transactions
  FOR ALL
  TO authenticated, anon
  USING ((select current_setting('request.jwt.claims', true)::json->>'role') = 'service_role');

-- tbl_coupons
DROP POLICY IF EXISTS "service_role_full_access" ON tbl_coupons;
CREATE POLICY "service_role_full_access" ON tbl_coupons
  FOR ALL
  TO authenticated, anon
  USING ((select current_setting('request.jwt.claims', true)::json->>'role') = 'service_role');

-- tbl_daily_tasks
DROP POLICY IF EXISTS "service_role_full_access" ON tbl_daily_tasks;
CREATE POLICY "service_role_full_access" ON tbl_daily_tasks
  FOR ALL
  TO authenticated, anon
  USING ((select current_setting('request.jwt.claims', true)::json->>'role') = 'service_role');

-- tbl_user_tasks
DROP POLICY IF EXISTS "service_role_full_access" ON tbl_user_tasks;
CREATE POLICY "service_role_full_access" ON tbl_user_tasks
  FOR ALL
  TO authenticated, anon
  USING ((select current_setting('request.jwt.claims', true)::json->>'role') = 'service_role');

-- tbl_coupon_shares
DROP POLICY IF EXISTS "service_role_full_access" ON tbl_coupon_shares;
CREATE POLICY "service_role_full_access" ON tbl_coupon_shares
  FOR ALL
  TO authenticated, anon
  USING ((select current_setting('request.jwt.claims', true)::json->>'role') = 'service_role');

-- tbl_coupon_interactions
DROP POLICY IF EXISTS "service_role_full_access" ON tbl_coupon_interactions;
CREATE POLICY "service_role_full_access" ON tbl_coupon_interactions
  FOR ALL
  TO authenticated, anon
  USING ((select current_setting('request.jwt.claims', true)::json->>'role') = 'service_role');

-- tbl_user_wallet_connections
DROP POLICY IF EXISTS "service_role_full_access" ON tbl_user_wallet_connections;
CREATE POLICY "service_role_full_access" ON tbl_user_wallet_connections
  FOR ALL
  TO authenticated, anon
  USING ((select current_setting('request.jwt.claims', true)::json->>'role') = 'service_role');

-- earning_distribution_settings
DROP POLICY IF EXISTS "service_role_full_access" ON earning_distribution_settings;
CREATE POLICY "service_role_full_access" ON earning_distribution_settings
  FOR ALL
  TO authenticated, anon
  USING ((select current_setting('request.jwt.claims', true)::json->>'role') = 'service_role');

-- tbl_social_shares
DROP POLICY IF EXISTS "service_role_full_access" ON tbl_social_shares;
CREATE POLICY "service_role_full_access" ON tbl_social_shares
  FOR ALL
  TO authenticated, anon
  USING ((select current_setting('request.jwt.claims', true)::json->>'role') = 'service_role');