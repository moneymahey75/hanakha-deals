/*
  # Add Admin Update Last Login RPC

  1. New Functions
    - `admin_update_last_login` - Updates last login timestamp for admin users
      - Takes admin_id as parameter
      - Uses SECURITY DEFINER to bypass RLS
      - Only updates last_login field

  2. Security
    - Uses SECURITY DEFINER to update without authentication
    - Only updates the last_login field, nothing else
*/

-- Create function to update admin last login
CREATE OR REPLACE FUNCTION admin_update_last_login(
  p_admin_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE tbl_admin_users
  SET tau_last_login = NOW()
  WHERE tau_id = p_admin_id
  AND tau_is_active = true;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION admin_update_last_login(UUID) TO authenticated, anon;

-- Add comment
COMMENT ON FUNCTION admin_update_last_login IS 'Updates last login timestamp for admin users. Uses SECURITY DEFINER to bypass RLS.';