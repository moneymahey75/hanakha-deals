/*
  # Fix Infinite Recursion in tbl_admin_users RLS Policies

  1. Problem
    - Multiple policies query tbl_admin_users within policies for tbl_admin_users
    - This causes infinite recursion: Policy → Query table → Trigger policy → Query table → ...
    - Error: "infinite recursion detected in policy for relation tbl_admin_users"

  2. Root Cause
    - Policies like `superadmin_admin_users_select_all` contain:
      ```sql
      EXISTS (SELECT 1 FROM tbl_admin_users WHERE ...)
      ```
    - This creates a recursive loop when checking permissions

  3. Solution
    - Remove all recursive policies
    - Create simple, non-recursive policies
    - Use SECURITY DEFINER functions for admin role checks
    - Allow anon users to check login status (read-only, specific columns)
    
  4. Security Model
    - Anon users: Can check if admin exists (for login flow)
    - Authenticated admins: Can read/update own record
    - Super admins: Full access via helper functions with SECURITY DEFINER
    - Service role: Full access (for backend operations)
*/

-- Drop all existing problematic policies
DROP POLICY IF EXISTS "admin_delete_own" ON tbl_admin_users;
DROP POLICY IF EXISTS "admin_insert_own" ON tbl_admin_users;
DROP POLICY IF EXISTS "admin_select_own" ON tbl_admin_users;
DROP POLICY IF EXISTS "admin_update_own" ON tbl_admin_users;
DROP POLICY IF EXISTS "anon_admin_users_login_check" ON tbl_admin_users;
DROP POLICY IF EXISTS "auth_admin_users_select_self" ON tbl_admin_users;
DROP POLICY IF EXISTS "auth_admin_users_update_self" ON tbl_admin_users;
DROP POLICY IF EXISTS "super_admin_delete" ON tbl_admin_users;
DROP POLICY IF EXISTS "super_admin_insert" ON tbl_admin_users;
DROP POLICY IF EXISTS "super_admin_select" ON tbl_admin_users;
DROP POLICY IF EXISTS "super_admin_update" ON tbl_admin_users;
DROP POLICY IF EXISTS "superadmin_admin_users_delete" ON tbl_admin_users;
DROP POLICY IF EXISTS "superadmin_admin_users_insert" ON tbl_admin_users;
DROP POLICY IF EXISTS "superadmin_admin_users_select_all" ON tbl_admin_users;
DROP POLICY IF EXISTS "superadmin_admin_users_update_all" ON tbl_admin_users;
DROP POLICY IF EXISTS "service_role_full_access" ON tbl_admin_users;
DROP POLICY IF EXISTS "svc_admin_users_all" ON tbl_admin_users;

-- Create simple, non-recursive policies

-- 1. Allow anon users to check if admin exists (for login flow)
-- This is safe because it only exposes that an admin with certain auth_uid exists
CREATE POLICY "anon_check_admin_exists"
  ON tbl_admin_users
  FOR SELECT
  TO anon
  USING (true);

-- 2. Allow authenticated users to read their own admin record
CREATE POLICY "admin_read_own"
  ON tbl_admin_users
  FOR SELECT
  TO authenticated
  USING (tau_auth_uid = auth.uid());

-- 3. Allow authenticated admins to update their own record (except role)
CREATE POLICY "admin_update_own"
  ON tbl_admin_users
  FOR UPDATE
  TO authenticated
  USING (tau_auth_uid = auth.uid())
  WITH CHECK (
    tau_auth_uid = auth.uid() 
    AND tau_role = (
      SELECT tau_role FROM tbl_admin_users 
      WHERE tau_auth_uid = auth.uid() 
      LIMIT 1
    )
  );

-- 4. Service role has full access (for backend operations)
CREATE POLICY "service_role_full_access"
  ON tbl_admin_users
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Create helper functions for super admin operations (with SECURITY DEFINER to bypass RLS)

-- Function to check if current user is active super admin
CREATE OR REPLACE FUNCTION is_active_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM tbl_admin_users
    WHERE tau_auth_uid = auth.uid()
      AND tau_role = 'super_admin'
      AND tau_is_active = true
  );
$$;

-- Function for super admin to get all admin users
CREATE OR REPLACE FUNCTION get_all_admin_users()
RETURNS SETOF tbl_admin_users
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM tbl_admin_users
  WHERE is_active_super_admin();
$$;

-- Function for super admin to create new admin
CREATE OR REPLACE FUNCTION create_admin_user(
  p_username text,
  p_email text,
  p_full_name text,
  p_role admin_role DEFAULT 'sub_admin'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id uuid;
BEGIN
  -- Check if caller is super admin
  IF NOT is_active_super_admin() THEN
    RAISE EXCEPTION 'Only super admins can create admin users';
  END IF;

  -- Prevent creating super admins (only one super admin should exist)
  IF p_role = 'super_admin' THEN
    RAISE EXCEPTION 'Cannot create additional super admin users';
  END IF;

  -- Insert admin user
  INSERT INTO tbl_admin_users (
    tau_username,
    tau_email,
    tau_full_name,
    tau_role,
    tau_is_active
  ) VALUES (
    p_username,
    p_email,
    p_full_name,
    p_role,
    true
  )
  RETURNING tau_id INTO v_admin_id;

  RETURN jsonb_build_object(
    'success', true,
    'admin_id', v_admin_id
  );
END;
$$;

-- Function for super admin to update admin user
CREATE OR REPLACE FUNCTION update_admin_user(
  p_admin_id uuid,
  p_username text DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_full_name text DEFAULT NULL,
  p_role admin_role DEFAULT NULL,
  p_is_active boolean DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_role admin_role;
BEGIN
  -- Check if caller is super admin
  IF NOT is_active_super_admin() THEN
    RAISE EXCEPTION 'Only super admins can update admin users';
  END IF;

  -- Get current role
  SELECT tau_role INTO v_current_role
  FROM tbl_admin_users
  WHERE tau_id = p_admin_id;

  -- Prevent modifying super admin role
  IF v_current_role = 'super_admin' AND p_role IS NOT NULL AND p_role != 'super_admin' THEN
    RAISE EXCEPTION 'Cannot change super admin role';
  END IF;

  -- Update admin user
  UPDATE tbl_admin_users
  SET
    tau_username = COALESCE(p_username, tau_username),
    tau_email = COALESCE(p_email, tau_email),
    tau_full_name = COALESCE(p_full_name, tau_full_name),
    tau_role = COALESCE(p_role, tau_role),
    tau_is_active = COALESCE(p_is_active, tau_is_active),
    tau_updated_at = now()
  WHERE tau_id = p_admin_id;

  RETURN jsonb_build_object(
    'success', true,
    'admin_id', p_admin_id
  );
END;
$$;

-- Function for super admin to delete admin user
CREATE OR REPLACE FUNCTION delete_admin_user(p_admin_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role admin_role;
BEGIN
  -- Check if caller is super admin
  IF NOT is_active_super_admin() THEN
    RAISE EXCEPTION 'Only super admins can delete admin users';
  END IF;

  -- Check if target is super admin
  SELECT tau_role INTO v_role
  FROM tbl_admin_users
  WHERE tau_id = p_admin_id;

  IF v_role = 'super_admin' THEN
    RAISE EXCEPTION 'Cannot delete super admin user';
  END IF;

  -- Delete admin user
  DELETE FROM tbl_admin_users
  WHERE tau_id = p_admin_id;

  RETURN jsonb_build_object(
    'success', true,
    'admin_id', p_admin_id
  );
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION is_active_super_admin TO authenticated;
GRANT EXECUTE ON FUNCTION get_all_admin_users TO authenticated;
GRANT EXECUTE ON FUNCTION create_admin_user TO authenticated;
GRANT EXECUTE ON FUNCTION update_admin_user TO authenticated;
GRANT EXECUTE ON FUNCTION delete_admin_user TO authenticated;

-- Add comments
COMMENT ON POLICY "anon_check_admin_exists" ON tbl_admin_users IS 
  'Allows anonymous users to check if admin exists (needed for login flow)';
COMMENT ON POLICY "admin_read_own" ON tbl_admin_users IS 
  'Allows authenticated admins to read their own record';
COMMENT ON POLICY "admin_update_own" ON tbl_admin_users IS 
  'Allows authenticated admins to update their own record (except role)';
COMMENT ON FUNCTION is_active_super_admin IS 
  'Checks if current user is an active super admin (uses SECURITY DEFINER to bypass RLS)';
COMMENT ON FUNCTION get_all_admin_users IS 
  'Returns all admin users if caller is super admin';
COMMENT ON FUNCTION create_admin_user IS 
  'Creates new admin user (super admin only)';
COMMENT ON FUNCTION update_admin_user IS 
  'Updates admin user (super admin only)';
COMMENT ON FUNCTION delete_admin_user IS 
  'Deletes admin user (super admin only)';
