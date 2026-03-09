/*
  # Add Update Admin Auth UID RPC

  1. New Functions
    - `update_admin_auth_uid` - Updates the Supabase Auth UID for an admin user
      - Takes admin_id and auth_uid as parameters
      - Uses SECURITY DEFINER to bypass RLS
      - Links admin users to Supabase Auth for RLS policies

  2. Security
    - Uses SECURITY DEFINER to update without authentication
    - Only updates the auth_uid field
*/

-- Create function to update admin auth UID
CREATE OR REPLACE FUNCTION update_admin_auth_uid(
  p_admin_id UUID,
  p_auth_uid UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE tbl_admin_users
  SET tau_auth_uid = p_auth_uid
  WHERE tau_id = p_admin_id
  AND tau_is_active = true;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION update_admin_auth_uid(UUID, UUID) TO authenticated, anon;

-- Add comment
COMMENT ON FUNCTION update_admin_auth_uid IS 'Updates Supabase Auth UID for admin users to enable RLS. Uses SECURITY DEFINER to bypass RLS.';