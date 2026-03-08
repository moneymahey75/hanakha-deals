/*
  # Fix All Remaining Recursive RLS Policies

  1. Changes
    - Replace all direct tbl_admin_users queries in policies with security definer functions
    - Update policies across all tables to use is_super_admin() and is_sub_admin()
  
  2. Security
    - Maintains same access control logic
    - Uses security definer functions to break recursion
    - Service role keeps full access
*/

-- List of tables to fix: tbl_coupon_interactions, tbl_coupon_shares, tbl_coupons, 
-- tbl_daily_tasks, tbl_email_templates, tbl_payments, tbl_social_shares,
-- tbl_subscription_plans, tbl_system_settings, tbl_user_activity_logs, 
-- tbl_user_tasks, tbl_user_wallet_connections, tbl_wallet_transactions, tbl_wallets

-- tbl_coupon_interactions
DROP POLICY IF EXISTS "super_admin_full_access" ON tbl_coupon_interactions;
DROP POLICY IF EXISTS "sub_admin_select" ON tbl_coupon_interactions;
DROP POLICY IF EXISTS "sub_admin_update" ON tbl_coupon_interactions;
DROP POLICY IF EXISTS "sub_admin_delete" ON tbl_coupon_interactions;

CREATE POLICY "super_admin_full_access" ON tbl_coupon_interactions FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());
CREATE POLICY "sub_admin_select" ON tbl_coupon_interactions FOR SELECT TO authenticated USING (is_sub_admin());
CREATE POLICY "sub_admin_update" ON tbl_coupon_interactions FOR UPDATE TO authenticated USING (is_sub_admin()) WITH CHECK (is_sub_admin());
CREATE POLICY "sub_admin_delete" ON tbl_coupon_interactions FOR DELETE TO authenticated USING (is_sub_admin());

-- tbl_coupon_shares
DROP POLICY IF EXISTS "super_admin_full_access" ON tbl_coupon_shares;
DROP POLICY IF EXISTS "sub_admin_select" ON tbl_coupon_shares;
DROP POLICY IF EXISTS "sub_admin_update" ON tbl_coupon_shares;

CREATE POLICY "super_admin_full_access" ON tbl_coupon_shares FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());
CREATE POLICY "sub_admin_select" ON tbl_coupon_shares FOR SELECT TO authenticated USING (is_sub_admin());
CREATE POLICY "sub_admin_update" ON tbl_coupon_shares FOR UPDATE TO authenticated USING (is_sub_admin()) WITH CHECK (is_sub_admin());

-- tbl_coupons
DROP POLICY IF EXISTS "super_admin_full_access" ON tbl_coupons;
DROP POLICY IF EXISTS "sub_admin_select" ON tbl_coupons;
DROP POLICY IF EXISTS "sub_admin_update" ON tbl_coupons;
DROP POLICY IF EXISTS "sub_admin_insert" ON tbl_coupons;

CREATE POLICY "super_admin_full_access" ON tbl_coupons FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());
CREATE POLICY "sub_admin_select" ON tbl_coupons FOR SELECT TO authenticated USING (is_sub_admin());
CREATE POLICY "sub_admin_update" ON tbl_coupons FOR UPDATE TO authenticated USING (is_sub_admin()) WITH CHECK (is_sub_admin());
CREATE POLICY "sub_admin_insert" ON tbl_coupons FOR INSERT TO authenticated WITH CHECK (is_sub_admin());

-- tbl_daily_tasks
DROP POLICY IF EXISTS "super_admin_full_access" ON tbl_daily_tasks;
DROP POLICY IF EXISTS "sub_admin_select" ON tbl_daily_tasks;
DROP POLICY IF EXISTS "sub_admin_insert" ON tbl_daily_tasks;
DROP POLICY IF EXISTS "sub_admin_update" ON tbl_daily_tasks;

CREATE POLICY "super_admin_full_access" ON tbl_daily_tasks FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());
CREATE POLICY "sub_admin_select" ON tbl_daily_tasks FOR SELECT TO authenticated USING (is_sub_admin());
CREATE POLICY "sub_admin_insert" ON tbl_daily_tasks FOR INSERT TO authenticated WITH CHECK (is_sub_admin());
CREATE POLICY "sub_admin_update" ON tbl_daily_tasks FOR UPDATE TO authenticated USING (is_sub_admin()) WITH CHECK (is_sub_admin());

-- tbl_email_templates
DROP POLICY IF EXISTS "super_admin_full_access" ON tbl_email_templates;
DROP POLICY IF EXISTS "sub_admin_select" ON tbl_email_templates;

CREATE POLICY "super_admin_full_access" ON tbl_email_templates FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());
CREATE POLICY "sub_admin_select" ON tbl_email_templates FOR SELECT TO authenticated USING (is_sub_admin());

-- tbl_payments
DROP POLICY IF EXISTS "super_admin_full_access" ON tbl_payments;
DROP POLICY IF EXISTS "sub_admin_select" ON tbl_payments;
DROP POLICY IF EXISTS "sub_admin_insert" ON tbl_payments;
DROP POLICY IF EXISTS "sub_admin_update" ON tbl_payments;

CREATE POLICY "super_admin_full_access" ON tbl_payments FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());
CREATE POLICY "sub_admin_select" ON tbl_payments FOR SELECT TO authenticated USING (is_sub_admin());
CREATE POLICY "sub_admin_insert" ON tbl_payments FOR INSERT TO authenticated WITH CHECK (is_sub_admin());
CREATE POLICY "sub_admin_update" ON tbl_payments FOR UPDATE TO authenticated USING (is_sub_admin()) WITH CHECK (is_sub_admin());

-- tbl_social_shares
DROP POLICY IF EXISTS "super_admin_full_access" ON tbl_social_shares;
DROP POLICY IF EXISTS "sub_admin_select" ON tbl_social_shares;
DROP POLICY IF EXISTS "sub_admin_update" ON tbl_social_shares;

CREATE POLICY "super_admin_full_access" ON tbl_social_shares FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());
CREATE POLICY "sub_admin_select" ON tbl_social_shares FOR SELECT TO authenticated USING (is_sub_admin());
CREATE POLICY "sub_admin_update" ON tbl_social_shares FOR UPDATE TO authenticated USING (is_sub_admin()) WITH CHECK (is_sub_admin());

-- tbl_subscription_plans
DROP POLICY IF EXISTS "super_admin_full_access" ON tbl_subscription_plans;
DROP POLICY IF EXISTS "sub_admin_select" ON tbl_subscription_plans;
DROP POLICY IF EXISTS "sub_admin_insert" ON tbl_subscription_plans;
DROP POLICY IF EXISTS "sub_admin_update" ON tbl_subscription_plans;

CREATE POLICY "super_admin_full_access" ON tbl_subscription_plans FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());
CREATE POLICY "sub_admin_select" ON tbl_subscription_plans FOR SELECT TO authenticated USING (is_sub_admin());
CREATE POLICY "sub_admin_insert" ON tbl_subscription_plans FOR INSERT TO authenticated WITH CHECK (is_sub_admin());
CREATE POLICY "sub_admin_update" ON tbl_subscription_plans FOR UPDATE TO authenticated USING (is_sub_admin()) WITH CHECK (is_sub_admin());

-- tbl_system_settings
DROP POLICY IF EXISTS "super_admin_full_access" ON tbl_system_settings;
DROP POLICY IF EXISTS "sub_admin_insert" ON tbl_system_settings;
DROP POLICY IF EXISTS "sub_admin_update" ON tbl_system_settings;

CREATE POLICY "super_admin_full_access" ON tbl_system_settings FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());
CREATE POLICY "sub_admin_insert" ON tbl_system_settings FOR INSERT TO authenticated WITH CHECK (is_sub_admin());
CREATE POLICY "sub_admin_update" ON tbl_system_settings FOR UPDATE TO authenticated USING (is_sub_admin()) WITH CHECK (is_sub_admin());

-- tbl_user_activity_logs
DROP POLICY IF EXISTS "super_admin_full_access" ON tbl_user_activity_logs;
DROP POLICY IF EXISTS "sub_admin_select" ON tbl_user_activity_logs;

CREATE POLICY "super_admin_full_access" ON tbl_user_activity_logs FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());
CREATE POLICY "sub_admin_select" ON tbl_user_activity_logs FOR SELECT TO authenticated USING (is_sub_admin());

-- tbl_user_tasks
DROP POLICY IF EXISTS "super_admin_full_access" ON tbl_user_tasks;
DROP POLICY IF EXISTS "sub_admin_select" ON tbl_user_tasks;
DROP POLICY IF EXISTS "sub_admin_update" ON tbl_user_tasks;

CREATE POLICY "super_admin_full_access" ON tbl_user_tasks FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());
CREATE POLICY "sub_admin_select" ON tbl_user_tasks FOR SELECT TO authenticated USING (is_sub_admin());
CREATE POLICY "sub_admin_update" ON tbl_user_tasks FOR UPDATE TO authenticated USING (is_sub_admin()) WITH CHECK (is_sub_admin());

-- tbl_user_wallet_connections
DROP POLICY IF EXISTS "super_admin_full_access" ON tbl_user_wallet_connections;
DROP POLICY IF EXISTS "sub_admin_select" ON tbl_user_wallet_connections;

CREATE POLICY "super_admin_full_access" ON tbl_user_wallet_connections FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());
CREATE POLICY "sub_admin_select" ON tbl_user_wallet_connections FOR SELECT TO authenticated USING (is_sub_admin());

-- tbl_wallet_transactions
DROP POLICY IF EXISTS "super_admin_full_access" ON tbl_wallet_transactions;
DROP POLICY IF EXISTS "sub_admin_select" ON tbl_wallet_transactions;

CREATE POLICY "super_admin_full_access" ON tbl_wallet_transactions FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());
CREATE POLICY "sub_admin_select" ON tbl_wallet_transactions FOR SELECT TO authenticated USING (is_sub_admin());

-- tbl_wallets
DROP POLICY IF EXISTS "super_admin_full_access" ON tbl_wallets;
DROP POLICY IF EXISTS "sub_admin_select" ON tbl_wallets;

CREATE POLICY "super_admin_full_access" ON tbl_wallets FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());
CREATE POLICY "sub_admin_select" ON tbl_wallets FOR SELECT TO authenticated USING (is_sub_admin());
