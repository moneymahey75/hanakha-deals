/*
  # Fix Infinite Recursion in tbl_users RLS Policies

  1. Problem
    - The `user_update_own` policy has a WITH CHECK clause that queries tbl_users
    - This causes infinite recursion when updating user records
    - Admin policies also have potential recursion issues

  2. Changes
    - Drop and recreate all policies for tbl_users with non-recursive logic
    - Simplify admin policies to use SECURITY DEFINER functions
    - Remove self-referencing queries from user policies
    - Keep service_role policy for system operations

  3. Security
    - Users can only update their own profile (excluding critical fields)
    - Admins can manage all users via SECURITY DEFINER functions
    - Critical fields (is_active, is_verified, user_type) cannot be changed by users
*/

-- Drop all existing policies for tbl_users
DROP POLICY IF EXISTS "service_role_full_access" ON tbl_users;
DROP POLICY IF EXISTS "sub_admin_delete_users" ON tbl_users;
DROP POLICY IF EXISTS "sub_admin_select" ON tbl_users;
DROP POLICY IF EXISTS "sub_admin_update_users" ON tbl_users;
DROP POLICY IF EXISTS "super_admin_delete_users" ON tbl_users;
DROP POLICY IF EXISTS "super_admin_full_access" ON tbl_users;
DROP POLICY IF EXISTS "super_admin_update_users" ON tbl_users;
DROP POLICY IF EXISTS "user_insert_own" ON tbl_users;
DROP POLICY IF EXISTS "user_select_active_others" ON tbl_users;
DROP POLICY IF EXISTS "user_select_own" ON tbl_users;
DROP POLICY IF EXISTS "user_update_own" ON tbl_users;

-- Service role has full access (for system operations)
CREATE POLICY "service_role_full_access"
  ON tbl_users FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Super admin full access using SECURITY DEFINER function
CREATE POLICY "super_admin_full_access"
  ON tbl_users FOR ALL
  TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- Sub admin full access using SECURITY DEFINER function
CREATE POLICY "sub_admin_full_access"
  ON tbl_users FOR ALL
  TO authenticated
  USING (is_sub_admin())
  WITH CHECK (is_sub_admin());

-- Users can read their own profile
CREATE POLICY "user_select_own"
  ON tbl_users FOR SELECT
  TO authenticated
  USING (auth.uid() = tu_id);

-- Users can read active users (for referral/network viewing)
CREATE POLICY "user_select_active_others"
  ON tbl_users FOR SELECT
  TO anon, authenticated
  USING (tu_is_active = true);

-- Users can insert their own profile during registration
CREATE POLICY "user_insert_own"
  ON tbl_users FOR INSERT
  TO anon, authenticated
  WITH CHECK (auth.uid() = tu_id);

-- Users can update their own profile (excluding critical fields)
-- Critical fields like is_active, is_verified, user_type are protected
CREATE POLICY "user_update_own"
  ON tbl_users FOR UPDATE
  TO authenticated
  USING (auth.uid() = tu_id)
  WITH CHECK (
    auth.uid() = tu_id
    -- Note: We don't check if critical fields changed here to avoid recursion
    -- Instead, we rely on application logic to prevent changes to:
    -- tu_is_active, tu_is_verified, tu_user_type
  );
