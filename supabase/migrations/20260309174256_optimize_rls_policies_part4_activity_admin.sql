/*
  # Optimize RLS Policies - Part 4: Activity Logs and Admin

  1. Performance Improvements
    - Replace `auth.uid()` with `(select auth.uid())` in all RLS policies
    
  2. Tables Updated
    - tbl_user_activity_logs
    - tbl_admin_users
    - tbl_admin_sessions
    - tbl_admin_activity_logs
*/

-- tbl_user_activity_logs policies
DROP POLICY IF EXISTS "service_role_full_access" ON tbl_user_activity_logs;
CREATE POLICY "service_role_full_access" ON tbl_user_activity_logs
  FOR ALL
  TO authenticated, anon
  USING ((select current_setting('request.jwt.claims', true)::json->>'role') = 'service_role');

DROP POLICY IF EXISTS "user_select_own" ON tbl_user_activity_logs;
CREATE POLICY "user_select_own" ON tbl_user_activity_logs
  FOR SELECT
  TO authenticated, anon
  USING ((select auth.uid()) = tual_user_id);

-- tbl_admin_users policies
DROP POLICY IF EXISTS "admin_select_own" ON tbl_admin_users;
CREATE POLICY "admin_select_own" ON tbl_admin_users
  FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = tau_auth_uid);

DROP POLICY IF EXISTS "admin_update_own" ON tbl_admin_users;
CREATE POLICY "admin_update_own" ON tbl_admin_users
  FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) = tau_auth_uid)
  WITH CHECK ((select auth.uid()) = tau_auth_uid);

DROP POLICY IF EXISTS "service_role_full_access" ON tbl_admin_users;
CREATE POLICY "service_role_full_access" ON tbl_admin_users
  FOR ALL
  TO authenticated
  USING ((select current_setting('request.jwt.claims', true)::json->>'role') = 'service_role');

DROP POLICY IF EXISTS "super_admin_delete" ON tbl_admin_users;
CREATE POLICY "super_admin_delete" ON tbl_admin_users
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tbl_admin_users
      WHERE tau_auth_uid = (select auth.uid())
      AND tau_role = 'super_admin'
      AND tau_is_active = true
    )
  );

DROP POLICY IF EXISTS "super_admin_update" ON tbl_admin_users;
CREATE POLICY "super_admin_update" ON tbl_admin_users
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tbl_admin_users
      WHERE tau_auth_uid = (select auth.uid())
      AND tau_role = 'super_admin'
      AND tau_is_active = true
    )
  );

-- tbl_admin_sessions policies
DROP POLICY IF EXISTS "admin_delete_own_sessions" ON tbl_admin_sessions;
CREATE POLICY "admin_delete_own_sessions" ON tbl_admin_sessions
  FOR DELETE
  TO authenticated
  USING (
    tas_admin_id IN (
      SELECT tau_id FROM tbl_admin_users
      WHERE tau_auth_uid = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "admin_insert_own_sessions" ON tbl_admin_sessions;
CREATE POLICY "admin_insert_own_sessions" ON tbl_admin_sessions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tas_admin_id IN (
      SELECT tau_id FROM tbl_admin_users
      WHERE tau_auth_uid = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "admin_select_own_sessions" ON tbl_admin_sessions;
CREATE POLICY "admin_select_own_sessions" ON tbl_admin_sessions
  FOR SELECT
  TO authenticated
  USING (
    tas_admin_id IN (
      SELECT tau_id FROM tbl_admin_users
      WHERE tau_auth_uid = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "admin_update_own_sessions" ON tbl_admin_sessions;
CREATE POLICY "admin_update_own_sessions" ON tbl_admin_sessions
  FOR UPDATE
  TO authenticated
  USING (
    tas_admin_id IN (
      SELECT tau_id FROM tbl_admin_users
      WHERE tau_auth_uid = (select auth.uid())
    )
  )
  WITH CHECK (
    tas_admin_id IN (
      SELECT tau_id FROM tbl_admin_users
      WHERE tau_auth_uid = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "service_role_full_access" ON tbl_admin_sessions;
CREATE POLICY "service_role_full_access" ON tbl_admin_sessions
  FOR ALL
  TO authenticated
  USING ((select current_setting('request.jwt.claims', true)::json->>'role') = 'service_role');

-- tbl_admin_activity_logs policies
DROP POLICY IF EXISTS "admin_delete_own_logs" ON tbl_admin_activity_logs;
CREATE POLICY "admin_delete_own_logs" ON tbl_admin_activity_logs
  FOR DELETE
  TO authenticated, anon
  USING (
    taal_admin_id IN (
      SELECT tau_id FROM tbl_admin_users
      WHERE tau_auth_uid = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "admin_insert_own_logs" ON tbl_admin_activity_logs;
CREATE POLICY "admin_insert_own_logs" ON tbl_admin_activity_logs
  FOR INSERT
  TO authenticated, anon
  WITH CHECK (
    taal_admin_id IN (
      SELECT tau_id FROM tbl_admin_users
      WHERE tau_auth_uid = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "admin_select_own_logs" ON tbl_admin_activity_logs;
CREATE POLICY "admin_select_own_logs" ON tbl_admin_activity_logs
  FOR SELECT
  TO authenticated, anon
  USING (
    taal_admin_id IN (
      SELECT tau_id FROM tbl_admin_users
      WHERE tau_auth_uid = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "admin_update_own_logs" ON tbl_admin_activity_logs;
CREATE POLICY "admin_update_own_logs" ON tbl_admin_activity_logs
  FOR UPDATE
  TO authenticated, anon
  USING (
    taal_admin_id IN (
      SELECT tau_id FROM tbl_admin_users
      WHERE tau_auth_uid = (select auth.uid())
    )
  )
  WITH CHECK (
    taal_admin_id IN (
      SELECT tau_id FROM tbl_admin_users
      WHERE tau_auth_uid = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "service_role_full_access" ON tbl_admin_activity_logs;
CREATE POLICY "service_role_full_access" ON tbl_admin_activity_logs
  FOR ALL
  TO authenticated, anon
  USING ((select current_setting('request.jwt.claims', true)::json->>'role') = 'service_role');

DROP POLICY IF EXISTS "super_admin_full_access" ON tbl_admin_activity_logs;
CREATE POLICY "super_admin_full_access" ON tbl_admin_activity_logs
  FOR ALL
  TO authenticated, anon
  USING (
    EXISTS (
      SELECT 1 FROM tbl_admin_users
      WHERE tau_auth_uid = (select auth.uid())
      AND tau_role = 'super_admin'
      AND tau_is_active = true
    )
  );