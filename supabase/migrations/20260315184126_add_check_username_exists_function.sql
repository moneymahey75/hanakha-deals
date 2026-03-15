/*
  # Add Username Validation Function

  1. New Functions
    - `check_username_exists` - Public function to check if username is taken
      - Takes a username as input
      - Returns boolean indicating if username exists
      - Uses SECURITY DEFINER to bypass RLS
      - Accessible to anonymous users (needed for registration)

  2. Purpose
    - Allows unauthenticated users to check username availability during registration
    - Prevents duplicate usernames
    - Case-insensitive check

  3. Security
    - Uses SECURITY DEFINER to bypass RLS restrictions
    - Only returns boolean (username exists or not)
    - No sensitive data exposed
    - No authentication required (public function for registration flow)
*/

-- Create function to check if username exists
CREATE OR REPLACE FUNCTION check_username_exists(
  p_username TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exists BOOLEAN;
BEGIN
  -- Check if username exists (case-insensitive)
  SELECT EXISTS (
    SELECT 1
    FROM tbl_user_profiles
    WHERE LOWER(tup_username) = LOWER(p_username)
  ) INTO v_exists;
  
  RETURN v_exists;
END;
$$;

-- Grant execute permission to all users (needed for registration)
GRANT EXECUTE ON FUNCTION check_username_exists(TEXT) TO anon, authenticated, public;

-- Add comment
COMMENT ON FUNCTION check_username_exists IS 'Public function to check if username is already taken during registration. Returns true if username exists, false otherwise.';
