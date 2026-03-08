/*
  # Fix Infinite Recursion in RLS Policies

  1. Changes
    - Create security definer functions to break recursion
    - Simplify RLS policies to avoid querying same table
    - Allow login by using raw metadata checks
  
  2. Security
    - Functions are security definer to bypass RLS during checks
    - Policies still maintain proper access control
*/

-- Drop existing problematic policies
DROP POLICY IF EXISTS "super_admin_select" ON tbl_admin_users;
DROP POLICY IF EXISTS "super_admin_insert" ON tbl_admin_users;
DROP POLICY IF EXISTS "super_admin_update" ON tbl_admin_users;
DROP POLICY IF EXISTS "super_admin_delete" ON tbl_admin_users;

DROP POLICY IF EXISTS "super_admin_full_access" ON tbl_users;
DROP POLICY IF EXISTS "sub_admin_select" ON tbl_users;
DROP POLICY IF EXISTS "sub_admin_update" ON tbl_users;

DROP POLICY IF EXISTS "super_admin_full_access" ON tbl_companies;
DROP POLICY IF EXISTS "sub_admin_select" ON tbl_companies;
DROP POLICY IF EXISTS "sub_admin_update" ON tbl_companies;
DROP POLICY IF EXISTS "sub_admin_insert" ON tbl_companies;

-- Create security definer function to check admin role
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM tbl_admin_users
    WHERE tau_auth_uid = auth.uid()
    AND tau_role = 'super_admin'
    AND tau_is_active = true
  );
END;
$$;

-- Create security definer function to check sub admin role
CREATE OR REPLACE FUNCTION is_sub_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM tbl_admin_users
    WHERE tau_auth_uid = auth.uid()
    AND tau_role = 'sub_admin'
    AND tau_is_active = true
  );
END;
$$;

-- Create security definer function to check any admin role
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM tbl_admin_users
    WHERE tau_auth_uid = auth.uid()
    AND tau_is_active = true
  );
END;
$$;

-- tbl_admin_users policies (simplified to avoid recursion)
CREATE POLICY "super_admin_select"
  ON tbl_admin_users
  FOR SELECT
  TO authenticated
  USING (is_super_admin());

CREATE POLICY "super_admin_insert"
  ON tbl_admin_users
  FOR INSERT
  TO authenticated
  WITH CHECK (is_super_admin());

CREATE POLICY "super_admin_update"
  ON tbl_admin_users
  FOR UPDATE
  TO authenticated
  USING (is_super_admin())
  WITH CHECK (
    (tau_auth_uid = auth.uid() AND tau_role = 'super_admin') 
    OR tau_auth_uid != auth.uid()
  );

CREATE POLICY "super_admin_delete"
  ON tbl_admin_users
  FOR DELETE
  TO authenticated
  USING (tau_auth_uid != auth.uid() AND is_super_admin());

-- tbl_users policies
CREATE POLICY "super_admin_full_access"
  ON tbl_users
  FOR ALL
  TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

CREATE POLICY "sub_admin_select"
  ON tbl_users
  FOR SELECT
  TO authenticated
  USING (is_sub_admin());

CREATE POLICY "sub_admin_update"
  ON tbl_users
  FOR UPDATE
  TO authenticated
  USING (is_sub_admin())
  WITH CHECK (is_sub_admin() AND tu_user_type != 'admin');

-- tbl_companies policies
CREATE POLICY "super_admin_full_access"
  ON tbl_companies
  FOR ALL
  TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

CREATE POLICY "sub_admin_select"
  ON tbl_companies
  FOR SELECT
  TO authenticated
  USING (is_sub_admin());

CREATE POLICY "sub_admin_update"
  ON tbl_companies
  FOR UPDATE
  TO authenticated
  USING (is_sub_admin())
  WITH CHECK (is_sub_admin());

CREATE POLICY "sub_admin_insert"
  ON tbl_companies
  FOR INSERT
  TO authenticated
  WITH CHECK (is_sub_admin());
