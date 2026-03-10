/*
  # Fix Daily Tasks Admin Insert Permission

  1. Changes
    - Drop existing complex admin policies for daily tasks
    - Add simplified admin policies that directly check tbl_admin_users
    - Ensure both super_admin and sub_admin can perform all operations
  
  2. Security
    - Maintains RLS protection
    - Verifies admin status through tbl_admin_users table
    - Checks active status and proper role
*/

-- Drop existing admin policies that might be causing conflicts
DROP POLICY IF EXISTS "super_admin_daily_tasks" ON tbl_daily_tasks;
DROP POLICY IF EXISTS "super_admin_full_access" ON tbl_daily_tasks;
DROP POLICY IF EXISTS "sub_admin_daily_tasks_update" ON tbl_daily_tasks;
DROP POLICY IF EXISTS "sub_admin_daily_tasks_delete" ON tbl_daily_tasks;
DROP POLICY IF EXISTS "sub_admin_insert" ON tbl_daily_tasks;
DROP POLICY IF EXISTS "sub_admin_select" ON tbl_daily_tasks;
DROP POLICY IF EXISTS "sub_admin_update" ON tbl_daily_tasks;

-- Create unified admin policies for all operations
CREATE POLICY "admin_select_daily_tasks"
  ON tbl_daily_tasks
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tbl_admin_users
      WHERE tau_auth_uid = auth.uid()
      AND tau_is_active = true
      AND tau_role IN ('super_admin', 'sub_admin')
    )
  );

CREATE POLICY "admin_insert_daily_tasks"
  ON tbl_daily_tasks
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM tbl_admin_users
      WHERE tau_auth_uid = auth.uid()
      AND tau_is_active = true
      AND tau_role IN ('super_admin', 'sub_admin')
    )
  );

CREATE POLICY "admin_update_daily_tasks"
  ON tbl_daily_tasks
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tbl_admin_users
      WHERE tau_auth_uid = auth.uid()
      AND tau_is_active = true
      AND tau_role IN ('super_admin', 'sub_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM tbl_admin_users
      WHERE tau_auth_uid = auth.uid()
      AND tau_is_active = true
      AND tau_role IN ('super_admin', 'sub_admin')
    )
  );

CREATE POLICY "admin_delete_daily_tasks"
  ON tbl_daily_tasks
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tbl_admin_users
      WHERE tau_auth_uid = auth.uid()
      AND tau_is_active = true
      AND tau_role IN ('super_admin', 'sub_admin')
    )
  );
