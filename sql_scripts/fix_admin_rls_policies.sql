/*
  # Fix Admin RLS Policies for Data Access

  This script adds proper RLS policies to allow admin users to:
  1. Read all customer data (users, user_profiles)
  2. Read all company data (companies)
  3. Read all enrollments, payments, and related data
  4. Update and manage user data

  The policies check if the user is an admin by:
  - Checking tbl_admin_users table
  - Checking admin_users table (both naming conventions supported)
  - Checking users table with user_type = 'admin'
*/

-- ============================================
-- USERS TABLE POLICIES
-- ============================================

-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Users can read own data" ON users;
DROP POLICY IF EXISTS "Users can insert own data" ON users;
DROP POLICY IF EXISTS "Users can update own data" ON users;
DROP POLICY IF EXISTS "Users can delete own data" ON users;

-- Allow users to read their own data
CREATE POLICY "Users can read own data"
  ON users
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

-- Allow admins to read all user data (check multiple admin table variations)
CREATE POLICY "Admins can read all users"
  ON users
  FOR SELECT
  TO authenticated
  USING (
    -- Check tbl_admin_users table
    EXISTS (
      SELECT 1 FROM tbl_admin_users
      WHERE tau_id = auth.uid()
      AND tau_is_active = true
    )
    OR
    -- Check admin_users table
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE id = auth.uid()
      AND is_active = true
    )
    OR
    -- Check if user_type is admin in users table
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND user_type = 'admin'
    )
  );

-- Allow users to insert their own data
CREATE POLICY "Users can insert own data"
  ON users
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- Allow users to update their own data
CREATE POLICY "Users can update own data"
  ON users
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id);

-- Allow admins to update all users
CREATE POLICY "Admins can update all users"
  ON users
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tbl_admin_users
      WHERE tau_id = auth.uid()
      AND tau_is_active = true
    )
    OR
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE id = auth.uid()
      AND is_active = true
    )
    OR
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND user_type = 'admin'
    )
  );

-- Allow admins to delete users
CREATE POLICY "Admins can delete users"
  ON users
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tbl_admin_users
      WHERE tau_id = auth.uid()
      AND tau_is_active = true
    )
    OR
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE id = auth.uid()
      AND is_active = true
    )
    OR
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND user_type = 'admin'
    )
  );

-- ============================================
-- USER_PROFILES TABLE POLICIES
-- ============================================

DROP POLICY IF EXISTS "Users can read own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON user_profiles;
DROP POLICY IF EXISTS "Admins can read all profiles" ON user_profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON user_profiles;

-- Allow users to read their own profile
CREATE POLICY "Users can read own profile"
  ON user_profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Allow admins to read all profiles
CREATE POLICY "Admins can read all profiles"
  ON user_profiles
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tbl_admin_users
      WHERE tau_id = auth.uid()
      AND tau_is_active = true
    )
    OR
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE id = auth.uid()
      AND is_active = true
    )
    OR
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND user_type = 'admin'
    )
  );

-- Allow users to insert their own profile
CREATE POLICY "Users can insert own profile"
  ON user_profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Allow users to update their own profile
CREATE POLICY "Users can update own profile"
  ON user_profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

-- Allow admins to update all profiles
CREATE POLICY "Admins can update all profiles"
  ON user_profiles
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tbl_admin_users
      WHERE tau_id = auth.uid()
      AND tau_is_active = true
    )
    OR
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE id = auth.uid()
      AND is_active = true
    )
    OR
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND user_type = 'admin'
    )
  );

-- ============================================
-- COMPANIES TABLE POLICIES
-- ============================================

DROP POLICY IF EXISTS "Companies can read own data" ON companies;
DROP POLICY IF EXISTS "Companies can insert own data" ON companies;
DROP POLICY IF EXISTS "Companies can update own data" ON companies;
DROP POLICY IF EXISTS "Admins can read all companies" ON companies;
DROP POLICY IF EXISTS "Admins can update all companies" ON companies;

-- Allow companies to read their own data
CREATE POLICY "Companies can read own data"
  ON companies
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Allow admins to read all companies
CREATE POLICY "Admins can read all companies"
  ON companies
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tbl_admin_users
      WHERE tau_id = auth.uid()
      AND tau_is_active = true
    )
    OR
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE id = auth.uid()
      AND is_active = true
    )
    OR
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND user_type = 'admin'
    )
  );

-- Allow companies to insert their own data
CREATE POLICY "Companies can insert own data"
  ON companies
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Allow companies to update their own data
CREATE POLICY "Companies can update own data"
  ON companies
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

-- Allow admins to update all companies
CREATE POLICY "Admins can update all companies"
  ON companies
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tbl_admin_users
      WHERE tau_id = auth.uid()
      AND tau_is_active = true
    )
    OR
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE id = auth.uid()
      AND is_active = true
    )
    OR
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND user_type = 'admin'
    )
  );

-- ============================================
-- TBL_USERS TABLE (IF IT EXISTS)
-- ============================================
-- This handles the tbl_ prefixed version if it exists

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tbl_users') THEN
    -- Drop existing policies
    DROP POLICY IF EXISTS "Users can read own data" ON tbl_users;
    DROP POLICY IF EXISTS "Admins can read all users" ON tbl_users;
    DROP POLICY IF EXISTS "Users can insert own data" ON tbl_users;
    DROP POLICY IF EXISTS "Users can update own data" ON tbl_users;
    DROP POLICY IF EXISTS "Admins can update all users" ON tbl_users;

    -- Create new policies
    EXECUTE 'CREATE POLICY "Users can read own data" ON tbl_users FOR SELECT TO authenticated USING (auth.uid() = tu_id)';

    EXECUTE 'CREATE POLICY "Admins can read all users" ON tbl_users FOR SELECT TO authenticated USING (
      EXISTS (SELECT 1 FROM tbl_admin_users WHERE tau_id = auth.uid() AND tau_is_active = true)
      OR EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid() AND is_active = true)
    )';

    EXECUTE 'CREATE POLICY "Users can insert own data" ON tbl_users FOR INSERT TO authenticated WITH CHECK (auth.uid() = tu_id)';
    EXECUTE 'CREATE POLICY "Users can update own data" ON tbl_users FOR UPDATE TO authenticated USING (auth.uid() = tu_id)';

    EXECUTE 'CREATE POLICY "Admins can update all users" ON tbl_users FOR UPDATE TO authenticated USING (
      EXISTS (SELECT 1 FROM tbl_admin_users WHERE tau_id = auth.uid() AND tau_is_active = true)
      OR EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid() AND is_active = true)
    )';
  END IF;
END $$;

-- ============================================
-- TBL_USER_PROFILES TABLE (IF IT EXISTS)
-- ============================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tbl_user_profiles') THEN
    DROP POLICY IF EXISTS "Users can read own profile" ON tbl_user_profiles;
    DROP POLICY IF EXISTS "Admins can read all profiles" ON tbl_user_profiles;
    DROP POLICY IF EXISTS "Users can insert own profile" ON tbl_user_profiles;
    DROP POLICY IF EXISTS "Users can update own profile" ON tbl_user_profiles;
    DROP POLICY IF EXISTS "Admins can update all profiles" ON tbl_user_profiles;

    EXECUTE 'CREATE POLICY "Users can read own profile" ON tbl_user_profiles FOR SELECT TO authenticated USING (auth.uid() = tup_user_id)';

    EXECUTE 'CREATE POLICY "Admins can read all profiles" ON tbl_user_profiles FOR SELECT TO authenticated USING (
      EXISTS (SELECT 1 FROM tbl_admin_users WHERE tau_id = auth.uid() AND tau_is_active = true)
      OR EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid() AND is_active = true)
    )';

    EXECUTE 'CREATE POLICY "Users can insert own profile" ON tbl_user_profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = tup_user_id)';
    EXECUTE 'CREATE POLICY "Users can update own profile" ON tbl_user_profiles FOR UPDATE TO authenticated USING (auth.uid() = tup_user_id)';

    EXECUTE 'CREATE POLICY "Admins can update all profiles" ON tbl_user_profiles FOR UPDATE TO authenticated USING (
      EXISTS (SELECT 1 FROM tbl_admin_users WHERE tau_id = auth.uid() AND tau_is_active = true)
      OR EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid() AND is_active = true)
    )';
  END IF;
END $$;

-- ============================================
-- TBL_COMPANIES TABLE (IF IT EXISTS)
-- ============================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tbl_companies') THEN
    DROP POLICY IF EXISTS "Companies can read own data" ON tbl_companies;
    DROP POLICY IF EXISTS "Admins can read all companies" ON tbl_companies;
    DROP POLICY IF EXISTS "Companies can insert own data" ON tbl_companies;
    DROP POLICY IF EXISTS "Companies can update own data" ON tbl_companies;
    DROP POLICY IF EXISTS "Admins can update all companies" ON tbl_companies;

    EXECUTE 'CREATE POLICY "Companies can read own data" ON tbl_companies FOR SELECT TO authenticated USING (auth.uid() = tc_user_id)';

    EXECUTE 'CREATE POLICY "Admins can read all companies" ON tbl_companies FOR SELECT TO authenticated USING (
      EXISTS (SELECT 1 FROM tbl_admin_users WHERE tau_id = auth.uid() AND tau_is_active = true)
      OR EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid() AND is_active = true)
    )';

    EXECUTE 'CREATE POLICY "Companies can insert own data" ON tbl_companies FOR INSERT TO authenticated WITH CHECK (auth.uid() = tc_user_id)';
    EXECUTE 'CREATE POLICY "Companies can update own data" ON tbl_companies FOR UPDATE TO authenticated USING (auth.uid() = tc_user_id)';

    EXECUTE 'CREATE POLICY "Admins can update all companies" ON tbl_companies FOR UPDATE TO authenticated USING (
      EXISTS (SELECT 1 FROM tbl_admin_users WHERE tau_id = auth.uid() AND tau_is_active = true)
      OR EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid() AND is_active = true)
    )';
  END IF;
END $$;

-- ============================================
-- SUBSCRIPTION PLANS
-- ============================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'subscription_plans') THEN
    DROP POLICY IF EXISTS "Everyone can read subscription plans" ON subscription_plans;
    DROP POLICY IF EXISTS "Admins can manage subscription plans" ON subscription_plans;

    EXECUTE 'CREATE POLICY "Everyone can read subscription plans" ON subscription_plans FOR SELECT TO authenticated USING (is_active = true)';

    EXECUTE 'CREATE POLICY "Admins can manage subscription plans" ON subscription_plans FOR ALL TO authenticated USING (
      EXISTS (SELECT 1 FROM tbl_admin_users WHERE tau_id = auth.uid() AND tau_is_active = true)
      OR EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid() AND is_active = true)
    )';
  END IF;
END $$;

-- ============================================
-- TRANSACTIONS / PAYMENTS
-- ============================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'transactions') THEN
    DROP POLICY IF EXISTS "Users can read own transactions" ON transactions;
    DROP POLICY IF EXISTS "Admins can read all transactions" ON transactions;

    EXECUTE 'CREATE POLICY "Users can read own transactions" ON transactions FOR SELECT TO authenticated USING (auth.uid() = user_id)';

    EXECUTE 'CREATE POLICY "Admins can read all transactions" ON transactions FOR SELECT TO authenticated USING (
      EXISTS (SELECT 1 FROM tbl_admin_users WHERE tau_id = auth.uid() AND tau_is_active = true)
      OR EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid() AND is_active = true)
    )';
  END IF;
END $$;

-- ============================================
-- MLM TREE
-- ============================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tbl_mlm_tree') THEN
    DROP POLICY IF EXISTS "Users can read own mlm data" ON tbl_mlm_tree;
    DROP POLICY IF EXISTS "Admins can read all mlm data" ON tbl_mlm_tree;

    EXECUTE 'CREATE POLICY "Users can read own mlm data" ON tbl_mlm_tree FOR SELECT TO authenticated USING (auth.uid() = tmt_user_id)';

    EXECUTE 'CREATE POLICY "Admins can read all mlm data" ON tbl_mlm_tree FOR SELECT TO authenticated USING (
      EXISTS (SELECT 1 FROM tbl_admin_users WHERE tau_id = auth.uid() AND tau_is_active = true)
      OR EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid() AND is_active = true)
    )';
  END IF;
END $$;

-- ============================================
-- OTP VERIFICATIONS
-- ============================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tbl_otp_verifications') THEN
    DROP POLICY IF EXISTS "Users can manage own otp" ON tbl_otp_verifications;
    DROP POLICY IF EXISTS "Admins can read all otp" ON tbl_otp_verifications;

    EXECUTE 'CREATE POLICY "Users can manage own otp" ON tbl_otp_verifications FOR ALL TO authenticated USING (auth.uid() = tov_user_id)';

    EXECUTE 'CREATE POLICY "Admins can read all otp" ON tbl_otp_verifications FOR SELECT TO authenticated USING (
      EXISTS (SELECT 1 FROM tbl_admin_users WHERE tau_id = auth.uid() AND tau_is_active = true)
      OR EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid() AND is_active = true)
    )';
  END IF;
END $$;

-- ============================================
-- GRANT PERMISSIONS
-- ============================================

-- Grant necessary permissions to authenticated users
GRANT SELECT, INSERT, UPDATE, DELETE ON users TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON user_profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON companies TO authenticated;

-- Grant permissions to tbl_ prefixed tables if they exist
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tbl_users') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON tbl_users TO authenticated;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tbl_user_profiles') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON tbl_user_profiles TO authenticated;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tbl_companies') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON tbl_companies TO authenticated;
  END IF;
END $$;
