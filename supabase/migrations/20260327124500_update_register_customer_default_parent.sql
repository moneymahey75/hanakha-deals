-- Ensure default parent assignment when no Parent A/C provided

CREATE OR REPLACE FUNCTION public.register_customer(
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
  v_parent_account text;
  v_default_parent text;
BEGIN
  -- Resolve default parent if none provided
  SELECT tup_sponsorship_number INTO v_default_parent
  FROM tbl_user_profiles
  WHERE tup_is_default_parent = true
  LIMIT 1;

  v_parent_account := NULLIF(p_parent_account, '');
  IF v_parent_account IS NULL THEN
    IF v_default_parent IS NULL THEN
      RAISE EXCEPTION 'Default parent account not configured';
    END IF;
    v_parent_account := v_default_parent;
  END IF;

  -- Upsert user record (may already exist from auth trigger)
  INSERT INTO tbl_users (tu_id, tu_email, tu_user_type)
  VALUES (p_user_id, p_email, 'customer')
  ON CONFLICT (tu_id) DO UPDATE
  SET 
    tu_email = EXCLUDED.tu_email,
    tu_user_type = EXCLUDED.tu_user_type,
    tu_updated_at = now();

  -- Get sponsor ID
  SELECT tup_user_id INTO v_sponsor_id
  FROM tbl_user_profiles
  WHERE tup_sponsorship_number = v_parent_account;
  
  IF v_sponsor_id IS NULL THEN
    RAISE EXCEPTION 'Invalid sponsorship number: %', v_parent_account;
  END IF;

  -- Insert or update profile record
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
    v_parent_account
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

  -- Update referrer_id in tbl_users table
  UPDATE tbl_users
  SET tu_referrer_id = v_sponsor_id,
      tu_updated_at = now()
  WHERE tu_id = p_user_id;

  -- Return success with user info
  v_result := jsonb_build_object(
    'success', true,
    'user_id', p_user_id,
    'sponsor_id', v_sponsor_id,
    'parent_account', v_parent_account
  );

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION register_customer IS 'Customer registration function. Stores sponsorship code in tbl_user_profiles.tup_parent_account and sponsor UUID in tbl_users.tu_referrer_id. Assigns default parent if none provided.';

GRANT EXECUTE ON FUNCTION register_customer(uuid, text, text, text, text, text, text, text) TO authenticated, anon;
