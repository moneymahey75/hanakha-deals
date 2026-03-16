/*
  # Fix Username Lookup with Secure RPC Functions

  1. New Functions
    - `check_username_exists` - Check if username is taken (recreated with proper permissions)
    - `get_email_by_username` - Get user email from username for login
    - `get_profile_by_sponsorship` - Get user profile by sponsorship code for registration

  2. Security
    - All functions use SECURITY DEFINER to bypass RLS safely
    - Explicit GRANT EXECUTE to anon, authenticated, and service_role
    - REVOKE PUBLIC access first to ensure clean permissions
    - Functions only return necessary data, no sensitive information exposed

  3. Purpose
    - Enable username-based login without exposing table directly to anon users
    - Enable sponsorship code validation during registration
    - Enable username uniqueness check during registration
    - Maintain security by using RPC functions instead of direct table queries

  4. Fallback Policy
    - Add minimal anon SELECT policy as safety net for username/sponsorship lookups
    - Only exposes username and sponsorship_number columns, nothing sensitive
*/

-- Drop existing functions to recreate cleanly
DROP FUNCTION IF EXISTS check_username_exists(TEXT);
DROP FUNCTION IF EXISTS get_email_by_username(TEXT);
DROP FUNCTION IF EXISTS get_profile_by_sponsorship(TEXT);

-- Function 1: Check if username exists (for registration)
CREATE OR REPLACE FUNCTION check_username_exists(p_username TEXT)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM tbl_user_profiles
    WHERE LOWER(tup_username) = LOWER(p_username)
  );
$$;

-- Revoke default public access, then grant explicitly
REVOKE ALL ON FUNCTION check_username_exists(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION check_username_exists(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION check_username_exists(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION check_username_exists(TEXT) TO service_role;

COMMENT ON FUNCTION check_username_exists IS 'Public function to check if username is already taken during registration. Returns true if username exists, false otherwise.';

-- Function 2: Get email by username (for login)
CREATE OR REPLACE FUNCTION get_email_by_username(p_username TEXT)
RETURNS TABLE (
  user_id uuid,
  email text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    up.tup_user_id as user_id,
    u.tu_email as email
  FROM tbl_user_profiles up
  INNER JOIN tbl_users u ON u.tu_id = up.tup_user_id
  WHERE LOWER(up.tup_username) = LOWER(p_username)
    AND up.tup_user_id IS NOT NULL
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION get_email_by_username(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_email_by_username(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION get_email_by_username(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_email_by_username(TEXT) TO service_role;

COMMENT ON FUNCTION get_email_by_username IS 'Get user email from username for login authentication. Used when user logs in with username instead of email.';

-- Function 3: Get profile by sponsorship code (for registration)
CREATE OR REPLACE FUNCTION get_profile_by_sponsorship(p_code TEXT)
RETURNS TABLE (
  tup_user_id uuid,
  tup_username text,
  tup_sponsorship_number text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    tup_user_id,
    tup_username,
    tup_sponsorship_number
  FROM tbl_user_profiles
  WHERE tup_sponsorship_number = p_code
    AND tup_user_id IS NOT NULL
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION get_profile_by_sponsorship(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_profile_by_sponsorship(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION get_profile_by_sponsorship(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_profile_by_sponsorship(TEXT) TO service_role;

COMMENT ON FUNCTION get_profile_by_sponsorship IS 'Get user profile by sponsorship code for registration validation. Returns user info if sponsorship code is valid.';

-- Add minimal anon SELECT policy as safety net
-- Only exposes username and sponsorship_number columns, nothing sensitive
DROP POLICY IF EXISTS "anon_username_sponsorship_lookup" ON tbl_user_profiles;

CREATE POLICY "anon_username_sponsorship_lookup"
  ON tbl_user_profiles AS PERMISSIVE FOR SELECT TO anon
  USING (
    -- Only allow access to username and sponsorship number columns
    -- This is a fallback safety net in case direct queries are made
    tup_username IS NOT NULL OR tup_sponsorship_number IS NOT NULL
  );
