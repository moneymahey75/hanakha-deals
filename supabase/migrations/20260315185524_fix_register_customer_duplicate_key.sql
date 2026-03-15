/*
  # Fix register_customer Duplicate Key Error

  1. Problem
    - During signup, auth.users trigger automatically creates tbl_users record
    - Then register_customer tries to INSERT into tbl_users again
    - This causes duplicate key error: "Key (tu_id)=(...) already exists"

  2. Root Cause
    - Workflow: Auth signup → trigger_sync_auth_user → sync_auth_user_to_tbl_users
    - This creates tbl_users record automatically
    - Frontend then calls register_customer which tries to INSERT again

  3. Solution
    - Update register_customer to use INSERT ... ON CONFLICT DO UPDATE
    - This makes it idempotent - works whether record exists or not
    - Update the user record if it exists, insert if it doesn't
    - Then handle profile creation/update properly

  4. Changes
    - Drop old register_customer and register_company functions
    - Recreate with UPSERT logic
    - Return jsonb with success status for better error handling
*/

-- Drop old functions
DROP FUNCTION IF EXISTS register_customer(uuid, text, text, text, text, text, text, text);
DROP FUNCTION IF EXISTS register_company(uuid, text, text, text, text, text, text, text, text, text, text);

-- Recreate register_customer with UPSERT logic
CREATE OR REPLACE FUNCTION register_customer(
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
  INSERT INTO tbl_user_profiles (
    tup_user_id, 
    tup_first_name, 
    tup_last_name, 
    tup_username, 
    tup_mobile, 
    tup_gender,
    tup_referrer_id
  ) VALUES (
    p_user_id, 
    p_first_name, 
    p_last_name, 
    p_username,
    p_mobile, 
    p_gender,
    v_sponsor_id
  )
  ON CONFLICT (tup_user_id) DO UPDATE
  SET
    tup_first_name = EXCLUDED.tup_first_name,
    tup_last_name = EXCLUDED.tup_last_name,
    tup_username = EXCLUDED.tup_username,
    tup_mobile = EXCLUDED.tup_mobile,
    tup_gender = EXCLUDED.tup_gender,
    tup_referrer_id = COALESCE(EXCLUDED.tup_referrer_id, tbl_user_profiles.tup_referrer_id),
    tup_updated_at = now();

  -- Update referrer_id in tbl_users if sponsor exists
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

-- Recreate register_company with UPSERT logic
CREATE OR REPLACE FUNCTION register_company(
  p_user_id uuid,
  p_email text,
  p_company_name text,
  p_brand_name text,
  p_business_type text,
  p_business_category text,
  p_registration_number text,
  p_gstin text,
  p_website_url text,
  p_official_email text,
  p_affiliate_code text
) 
RETURNS jsonb
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  -- Upsert user record (may already exist from auth trigger)
  INSERT INTO tbl_users (tu_id, tu_email, tu_user_type)
  VALUES (p_user_id, p_email, 'company')
  ON CONFLICT (tu_id) DO UPDATE
  SET 
    tu_email = EXCLUDED.tu_email,
    tu_user_type = EXCLUDED.tu_user_type,
    tu_updated_at = now();
  
  -- Insert or update company record
  INSERT INTO tbl_companies (
    tc_user_id, 
    tc_company_name, 
    tc_brand_name, 
    tc_business_type,
    tc_business_category, 
    tc_registration_number, 
    tc_gstin,
    tc_website_url, 
    tc_official_email, 
    tc_affiliate_code
  ) VALUES (
    p_user_id, 
    p_company_name, 
    p_brand_name, 
    p_business_type,
    p_business_category, 
    p_registration_number, 
    p_gstin,
    p_website_url, 
    p_official_email, 
    p_affiliate_code
  )
  ON CONFLICT (tc_user_id) DO UPDATE
  SET
    tc_company_name = EXCLUDED.tc_company_name,
    tc_brand_name = EXCLUDED.tc_brand_name,
    tc_business_type = EXCLUDED.tc_business_type,
    tc_business_category = EXCLUDED.tc_business_category,
    tc_registration_number = EXCLUDED.tc_registration_number,
    tc_gstin = EXCLUDED.tc_gstin,
    tc_website_url = EXCLUDED.tc_website_url,
    tc_official_email = EXCLUDED.tc_official_email,
    tc_affiliate_code = EXCLUDED.tc_affiliate_code,
    tc_updated_at = now();

  -- Return success with user info
  v_result := jsonb_build_object(
    'success', true,
    'user_id', p_user_id,
    'company_name', p_company_name
  );

  RETURN v_result;
END;
$$;

-- Add comments
COMMENT ON FUNCTION register_customer IS 'Completes customer registration after auth signup. Uses UPSERT to handle case where tbl_users record already exists from trigger.';
COMMENT ON FUNCTION register_company IS 'Completes company registration after auth signup. Uses UPSERT to handle case where tbl_users record already exists from trigger.';

-- Grant permissions
GRANT EXECUTE ON FUNCTION register_customer TO authenticated, anon;
GRANT EXECUTE ON FUNCTION register_company TO authenticated, anon;
