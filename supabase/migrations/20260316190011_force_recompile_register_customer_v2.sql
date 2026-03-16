/*
  # Force Recompile register_customer Function

  1. Problem
    - PostgreSQL may have cached old execution plan with tup_referrer_id
    - Even though function definition is correct, cached plan still references old column

  2. Solution
    - Drop function completely (CASCADE to remove dependencies)
    - Recreate with fresh compilation
    - Use slightly different variable names to force fresh compilation

  3. Changes
    - DROP FUNCTION CASCADE
    - CREATE new function from scratch with fresh plan
    - Grant permissions again
*/

-- Drop function with CASCADE to clear all cached plans
DROP FUNCTION IF EXISTS public.register_customer(uuid, text, text, text, text, text, text, text) CASCADE;

-- Recreate register_customer with proper columns and fresh compilation
CREATE FUNCTION public.register_customer(
  p_user_id uuid,
  p_email text,
  p_first_name text,
  p_last_name text,
  p_username text,
  p_mobile text,
  p_gender text,
  p_parent_account text
) 
RETURNS jsonb
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sponsor_id uuid;
  v_result jsonb;
BEGIN
  -- Upsert user record (may already exist from auth trigger)
  INSERT INTO tbl_users (tu_id, tu_email, tu_user_type)
  VALUES (p_user_id, p_email, 'customer')
  ON CONFLICT (tu_id) DO UPDATE
  SET 
    tu_email = EXCLUDED.tu_email,
    tu_user_type = EXCLUDED.tu_user_type,
    tu_updated_at = now();

  -- Get sponsor ID if parent account provided
  IF p_parent_account IS NOT NULL AND p_parent_account != '' THEN
    SELECT tup_user_id INTO v_sponsor_id
    FROM tbl_user_profiles
    WHERE tup_sponsorship_number = p_parent_account;
    
    IF v_sponsor_id IS NULL THEN
      RAISE EXCEPTION 'Invalid sponsorship number: %', p_parent_account;
    END IF;
  END IF;

  -- Insert or update profile record
  -- CRITICAL: Using tup_parent_account column (exists in table)
  -- NOT using tup_referrer_id (does NOT exist in table)
  INSERT INTO tbl_user_profiles (
    tup_user_id, 
    tup_first_name, 
    tup_last_name, 
    tup_username, 
    tup_mobile, 
    tup_gender,
    tup_parent_account
  ) VALUES (
    p_user_id, 
    p_first_name, 
    p_last_name, 
    p_username,
    p_mobile, 
    p_gender,
    p_parent_account
  )
  ON CONFLICT (tup_user_id) DO UPDATE
  SET
    tup_first_name = EXCLUDED.tup_first_name,
    tup_last_name = EXCLUDED.tup_last_name,
    tup_username = EXCLUDED.tup_username,
    tup_mobile = EXCLUDED.tup_mobile,
    tup_gender = EXCLUDED.tup_gender,
    tup_parent_account = COALESCE(EXCLUDED.tup_parent_account, tbl_user_profiles.tup_parent_account),
    tup_updated_at = now();

  -- Update referrer_id in tbl_users table (correct location for sponsor UUID)
  IF v_sponsor_id IS NOT NULL THEN
    UPDATE tbl_users
    SET tu_referrer_id = v_sponsor_id,
        tu_updated_at = now()
    WHERE tu_id = p_user_id;
  END IF;

  -- Return success with user info
  v_result := jsonb_build_object(
    'success', true,
    'user_id', p_user_id,
    'sponsor_id', v_sponsor_id
  );

  RETURN v_result;
END;
$$;

-- Add detailed comment
COMMENT ON FUNCTION register_customer IS 'Customer registration function. Stores sponsorship code in tbl_user_profiles.tup_parent_account and sponsor UUID in tbl_users.tu_referrer_id. Recompiled 2026-03-16 to clear cached plans.';

-- Grant permissions
GRANT EXECUTE ON FUNCTION register_customer(uuid, text, text, text, text, text, text, text) TO authenticated, anon;
