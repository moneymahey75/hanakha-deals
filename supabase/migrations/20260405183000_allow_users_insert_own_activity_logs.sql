/*
  # Allow users to insert their own activity logs

  1. Problem
    - Client-side login/registration/logout flows write to `tbl_user_activity_logs`
    - Existing RLS only permits service role full access and user-owned SELECT
    - Authenticated users receive `403 permission denied` on INSERT

  2. Fix
    - Add an authenticated INSERT policy scoped to the current user
*/

DROP POLICY IF EXISTS "user_insert_own" ON tbl_user_activity_logs;

CREATE POLICY "user_insert_own" ON tbl_user_activity_logs
  FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = tual_user_id);
