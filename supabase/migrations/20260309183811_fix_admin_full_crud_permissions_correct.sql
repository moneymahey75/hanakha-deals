/*
  # Fix Admin CRUD Permissions
  
  1. Changes
    - Grant super_admin full CRUD access to all tables
    - Grant sub_admin full CRUD access to customers, companies, coupons, daily tasks
    - Remove restrictive policies that prevent admin operations
    
  2. Security
    - Uses is_super_admin() and is_sub_admin() functions
    - Maintains proper access control
    - Allows admins to manage the platform effectively
*/

-- =====================================================
-- TBL_USERS: Admin CRUD permissions
-- =====================================================

DROP POLICY IF EXISTS "super_admin_update_users" ON tbl_users;
CREATE POLICY "super_admin_update_users" ON tbl_users
  FOR UPDATE
  TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS "super_admin_delete_users" ON tbl_users;
CREATE POLICY "super_admin_delete_users" ON tbl_users
  FOR DELETE
  TO authenticated
  USING (is_super_admin());

DROP POLICY IF EXISTS "sub_admin_update_users" ON tbl_users;
CREATE POLICY "sub_admin_update_users" ON tbl_users
  FOR UPDATE
  TO authenticated
  USING (is_sub_admin())
  WITH CHECK (is_sub_admin());

-- =====================================================
-- TBL_USER_PROFILES: Admin CRUD permissions
-- =====================================================

DROP POLICY IF EXISTS "sub_admin_update_profiles" ON tbl_user_profiles;
CREATE POLICY "sub_admin_update_profiles" ON tbl_user_profiles
  FOR UPDATE
  TO authenticated
  USING (is_sub_admin())
  WITH CHECK (is_sub_admin());

-- =====================================================
-- TBL_COMPANIES: Admin CRUD permissions
-- =====================================================

DROP POLICY IF EXISTS "super_admin_companies" ON tbl_companies;
CREATE POLICY "super_admin_companies" ON tbl_companies
  FOR ALL
  TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS "sub_admin_companies_update" ON tbl_companies;
CREATE POLICY "sub_admin_companies_update" ON tbl_companies
  FOR UPDATE
  TO authenticated
  USING (is_sub_admin())
  WITH CHECK (is_sub_admin());

DROP POLICY IF EXISTS "sub_admin_companies_delete" ON tbl_companies;
CREATE POLICY "sub_admin_companies_delete" ON tbl_companies
  FOR DELETE
  TO authenticated
  USING (is_sub_admin());

-- =====================================================
-- TBL_COUPONS: Admin CRUD permissions
-- =====================================================

DROP POLICY IF EXISTS "super_admin_coupons" ON tbl_coupons;
CREATE POLICY "super_admin_coupons" ON tbl_coupons
  FOR ALL
  TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS "sub_admin_coupons_update" ON tbl_coupons;
CREATE POLICY "sub_admin_coupons_update" ON tbl_coupons
  FOR UPDATE
  TO authenticated
  USING (is_sub_admin())
  WITH CHECK (is_sub_admin());

DROP POLICY IF EXISTS "sub_admin_coupons_delete" ON tbl_coupons;
CREATE POLICY "sub_admin_coupons_delete" ON tbl_coupons
  FOR DELETE
  TO authenticated
  USING (is_sub_admin());

-- =====================================================
-- TBL_DAILY_TASKS: Admin CRUD permissions
-- =====================================================

DROP POLICY IF EXISTS "super_admin_daily_tasks" ON tbl_daily_tasks;
CREATE POLICY "super_admin_daily_tasks" ON tbl_daily_tasks
  FOR ALL
  TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS "sub_admin_daily_tasks_update" ON tbl_daily_tasks;
CREATE POLICY "sub_admin_daily_tasks_update" ON tbl_daily_tasks
  FOR UPDATE
  TO authenticated
  USING (is_sub_admin())
  WITH CHECK (is_sub_admin());

DROP POLICY IF EXISTS "sub_admin_daily_tasks_delete" ON tbl_daily_tasks;
CREATE POLICY "sub_admin_daily_tasks_delete" ON tbl_daily_tasks
  FOR DELETE
  TO authenticated
  USING (is_sub_admin());

-- =====================================================
-- TBL_USER_SUBSCRIPTIONS: Admin read/update permissions
-- =====================================================

DROP POLICY IF EXISTS "super_admin_user_subscriptions" ON tbl_user_subscriptions;
CREATE POLICY "super_admin_user_subscriptions" ON tbl_user_subscriptions
  FOR ALL
  TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS "sub_admin_user_subscriptions_read" ON tbl_user_subscriptions;
CREATE POLICY "sub_admin_user_subscriptions_read" ON tbl_user_subscriptions
  FOR SELECT
  TO authenticated
  USING (is_sub_admin());

DROP POLICY IF EXISTS "sub_admin_user_subscriptions_update" ON tbl_user_subscriptions;
CREATE POLICY "sub_admin_user_subscriptions_update" ON tbl_user_subscriptions
  FOR UPDATE
  TO authenticated
  USING (is_sub_admin())
  WITH CHECK (is_sub_admin());

-- =====================================================
-- TBL_SUBSCRIPTION_PLANS: Admin full access
-- =====================================================

DROP POLICY IF EXISTS "super_admin_subscription_plans" ON tbl_subscription_plans;
CREATE POLICY "super_admin_subscription_plans" ON tbl_subscription_plans
  FOR ALL
  TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS "sub_admin_subscription_plans_read" ON tbl_subscription_plans;
CREATE POLICY "sub_admin_subscription_plans_read" ON tbl_subscription_plans
  FOR SELECT
  TO authenticated
  USING (is_sub_admin());

-- =====================================================
-- TBL_WALLETS: Admin read/update permissions
-- =====================================================

DROP POLICY IF EXISTS "super_admin_wallets" ON tbl_wallets;
CREATE POLICY "super_admin_wallets" ON tbl_wallets
  FOR ALL
  TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS "sub_admin_wallets_read" ON tbl_wallets;
CREATE POLICY "sub_admin_wallets_read" ON tbl_wallets
  FOR SELECT
  TO authenticated
  USING (is_sub_admin());

DROP POLICY IF EXISTS "sub_admin_wallets_update" ON tbl_wallets;
CREATE POLICY "sub_admin_wallets_update" ON tbl_wallets
  FOR UPDATE
  TO authenticated
  USING (is_sub_admin())
  WITH CHECK (is_sub_admin());
