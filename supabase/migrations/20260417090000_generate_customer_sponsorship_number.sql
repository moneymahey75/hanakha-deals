/*
  # Generate and Backfill Customer Sponsorship Numbers

  Problem:
  - `tbl_user_profiles.tup_sponsorship_number` is used across the app (customer dashboard, referral links, MLM RPCs),
    but `register_customer` did not populate it. As a result, customers see `N/A` / fallback codes.

  Solution:
  - Add a DB helper to generate an unused sponsorship code like `SP12345678`.
  - Update `public.register_customer(...)` to assign a sponsorship number on insert (and fill it if missing on update).
  - Backfill missing sponsorship numbers for existing profiles.
*/

-- Helper: generate a unique sponsorship number (SP + 8 digits)
CREATE OR REPLACE FUNCTION public.generate_unique_sponsorship_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text;
  v_try int := 0;
BEGIN
  LOOP
    v_try := v_try + 1;

    -- 8 digits, zero-padded; keep prefix consistent with existing app expectations (e.g. SP46282892)
    v_code := 'SP' || lpad((floor(random() * 100000000))::int::text, 8, '0');

    IF NOT EXISTS (
      SELECT 1
      FROM tbl_user_profiles
      WHERE lower(btrim(tup_sponsorship_number)) = lower(btrim(v_code))
    ) THEN
      RETURN v_code;
    END IF;

    IF v_try > 200 THEN
      RAISE EXCEPTION 'Could not generate unique sponsorship number after % attempts', v_try;
    END IF;
  END LOOP;
END;
$$;

-- Ensure register_customer assigns sponsorship numbers
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
  v_sponsorship text;
BEGIN
  -- Resolve default parent if none provided
  SELECT tup_sponsorship_number INTO v_default_parent
  FROM tbl_user_profiles
  WHERE tup_is_default_parent = true
  LIMIT 1;

  v_parent_account := NULLIF(p_parent_account, '');
  IF v_parent_account IS NULL THEN
    IF v_default_parent IS NULL OR btrim(v_default_parent) = '' THEN
      RAISE EXCEPTION 'Default parent account not configured';
    END IF;
    v_parent_account := v_default_parent;
  END IF;

  -- Generate/resolve sponsorship number for this user (persist if missing)
  SELECT tup_sponsorship_number INTO v_sponsorship
  FROM tbl_user_profiles
  WHERE tup_user_id = p_user_id;

  IF v_sponsorship IS NULL OR btrim(v_sponsorship) = '' THEN
    v_sponsorship := public.generate_unique_sponsorship_number();
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
  WHERE lower(btrim(tup_sponsorship_number)) = lower(btrim(v_parent_account));

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
    tup_parent_account,
    tup_sponsorship_number
  ) VALUES (
    p_user_id,
    p_first_name,
    p_last_name,
    p_username,
    p_mobile,
    p_gender,
    v_parent_account,
    v_sponsorship
  )
  ON CONFLICT (tup_user_id) DO UPDATE
  SET
    tup_first_name = EXCLUDED.tup_first_name,
    tup_last_name = EXCLUDED.tup_last_name,
    tup_username = EXCLUDED.tup_username,
    tup_mobile = EXCLUDED.tup_mobile,
    tup_gender = EXCLUDED.tup_gender,
    tup_parent_account = COALESCE(EXCLUDED.tup_parent_account, tbl_user_profiles.tup_parent_account),
    tup_sponsorship_number = CASE
      WHEN tbl_user_profiles.tup_sponsorship_number IS NULL OR btrim(tbl_user_profiles.tup_sponsorship_number) = ''
        THEN EXCLUDED.tup_sponsorship_number
      ELSE tbl_user_profiles.tup_sponsorship_number
    END,
    tup_updated_at = now();

  -- Update referrer_id in tbl_users table
  UPDATE tbl_users
  SET tu_referrer_id = v_sponsor_id,
      tu_updated_at = now()
  WHERE tu_id = p_user_id;

  -- Return success with user info (include sponsorship number for UI debugging)
  v_result := jsonb_build_object(
    'success', true,
    'user_id', p_user_id,
    'sponsor_id', v_sponsor_id,
    'parent_account', v_parent_account,
    'sponsorship_number', v_sponsorship
  );

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.register_customer IS 'Customer registration function. Assigns a unique tup_sponsorship_number, stores parent sponsorship in tbl_user_profiles.tup_parent_account and sponsor UUID in tbl_users.tu_referrer_id. Assigns default parent if none provided.';

GRANT EXECUTE ON FUNCTION public.register_customer(uuid, text, text, text, text, text, text, text) TO authenticated, anon;

-- Backfill missing sponsorship numbers for existing profiles
DO $$
DECLARE
  rec record;
  v_code text;
BEGIN
  FOR rec IN
    SELECT tup_user_id
    FROM tbl_user_profiles
    WHERE tup_sponsorship_number IS NULL OR btrim(tup_sponsorship_number) = ''
  LOOP
    v_code := public.generate_unique_sponsorship_number();
    UPDATE tbl_user_profiles
    SET tup_sponsorship_number = v_code,
        tup_updated_at = now()
    WHERE tup_user_id = rec.tup_user_id;
  END LOOP;
END;
$$;

