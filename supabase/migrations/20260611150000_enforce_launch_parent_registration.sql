-- Enforce Launch parent eligibility at the database layer.
-- Existing Pre-Launch users cannot be used as Parent A/C after launch until
-- they have an active Launch subscription.

CREATE OR REPLACE FUNCTION public.is_user_launch_eligible(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS '
  SELECT
    CASE
      WHEN NOT public.is_launch_phase_active() THEN true
      ELSE public.get_user_active_plan_phase(p_user_id) = ''launch''
    END;
';

CREATE OR REPLACE FUNCTION public.has_completed_launch_upgrade(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS '
  SELECT public.get_user_active_plan_phase(p_user_id) = ''launch'';
';

CREATE OR REPLACE FUNCTION public.get_sponsor_status_by_sponsorship_number(
  p_sponsorship_number text
)
RETURNS TABLE (
  user_id uuid,
  sponsorship_number text,
  first_name text,
  username text,
  is_active boolean,
  is_registration_paid boolean,
  email_verified boolean,
  mobile_verified boolean,
  is_launch_eligible boolean,
  current_plan_phase text,
  launch_phase_active boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.tup_user_id AS user_id,
    p.tup_sponsorship_number AS sponsorship_number,
    p.tup_first_name AS first_name,
    p.tup_username AS username,
    COALESCE(u.tu_is_active, false) AS is_active,
    COALESCE(u.tu_registration_paid, false) AS is_registration_paid,
    COALESCE(u.tu_email_verified, false) AS email_verified,
    COALESCE(u.tu_mobile_verified, false) AS mobile_verified,
    public.is_user_launch_eligible(u.tu_id) AS is_launch_eligible,
    public.get_user_active_plan_phase(u.tu_id) AS current_plan_phase,
    public.is_launch_phase_active() AS launch_phase_active
  FROM public.tbl_user_profiles p
  INNER JOIN public.tbl_users u ON u.tu_id = p.tup_user_id
  WHERE lower(btrim(p.tup_sponsorship_number)) = lower(btrim(p_sponsorship_number))
    AND u.tu_user_type = 'customer'
  LIMIT 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_sponsor_by_sponsorship_number(
  p_sponsorship_number text
)
RETURNS TABLE (
  user_id uuid,
  sponsorship_number text,
  first_name text,
  username text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.tup_user_id AS user_id,
    p.tup_sponsorship_number AS sponsorship_number,
    p.tup_first_name AS first_name,
    p.tup_username AS username
  FROM public.tbl_user_profiles p
  INNER JOIN public.tbl_users u ON u.tu_id = p.tup_user_id
  WHERE lower(btrim(p.tup_sponsorship_number)) = lower(btrim(p_sponsorship_number))
    AND COALESCE(u.tu_is_active, false) = true
    AND COALESCE(u.tu_registration_paid, false) = true
    AND public.meets_current_verification_requirements(u.tu_email_verified, u.tu_mobile_verified)
    AND u.tu_user_type = 'customer'
    AND public.is_user_launch_eligible(u.tu_id)
  LIMIT 1;
END;
$$;

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
  v_sponsor record;
BEGIN
  SELECT tup_sponsorship_number INTO v_default_parent
  FROM public.tbl_user_profiles
  WHERE tup_is_default_parent = true
  LIMIT 1;

  v_parent_account := NULLIF(btrim(p_parent_account), '');
  IF v_parent_account IS NULL THEN
    IF v_default_parent IS NULL OR btrim(v_default_parent) = '' THEN
      RAISE EXCEPTION 'Default parent account not configured';
    END IF;
    v_parent_account := v_default_parent;
  END IF;

  SELECT tup_sponsorship_number INTO v_sponsorship
  FROM public.tbl_user_profiles
  WHERE tup_user_id = p_user_id;

  IF v_sponsorship IS NULL OR btrim(v_sponsorship) = '' THEN
    v_sponsorship := public.generate_unique_sponsorship_number();
  END IF;

  INSERT INTO public.tbl_users (tu_id, tu_email, tu_user_type)
  VALUES (p_user_id, p_email, 'customer')
  ON CONFLICT (tu_id) DO UPDATE
  SET
    tu_email = EXCLUDED.tu_email,
    tu_user_type = EXCLUDED.tu_user_type,
    tu_updated_at = now();

  SELECT
    p.tup_user_id,
    p.tup_sponsorship_number,
    COALESCE(u.tu_is_active, false) AS is_active,
    COALESCE(u.tu_registration_paid, false) AS is_registration_paid,
    public.meets_current_verification_requirements(u.tu_email_verified, u.tu_mobile_verified) AS is_verified,
    public.is_user_launch_eligible(u.tu_id) AS is_launch_eligible
  INTO v_sponsor
  FROM public.tbl_user_profiles p
  JOIN public.tbl_users u ON u.tu_id = p.tup_user_id
  WHERE lower(btrim(p.tup_sponsorship_number)) = lower(btrim(v_parent_account))
    AND u.tu_user_type = 'customer'
  LIMIT 1;

  IF v_sponsor.tup_user_id IS NULL THEN
    RAISE EXCEPTION 'Invalid sponsorship number: %', v_parent_account;
  END IF;

  IF NOT v_sponsor.is_active OR NOT v_sponsor.is_registration_paid OR NOT v_sponsor.is_verified THEN
    RAISE EXCEPTION 'Parent A/C is not active/verified or registration-paid';
  END IF;

  IF NOT v_sponsor.is_launch_eligible THEN
    RAISE EXCEPTION 'Parent customer has to upgrade his account.';
  END IF;

  v_sponsor_id := v_sponsor.tup_user_id;
  v_parent_account := v_sponsor.tup_sponsorship_number;

  INSERT INTO public.tbl_user_profiles (
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
    tup_parent_account = EXCLUDED.tup_parent_account,
    tup_sponsorship_number = CASE
      WHEN tbl_user_profiles.tup_sponsorship_number IS NULL OR btrim(tbl_user_profiles.tup_sponsorship_number) = ''
        THEN EXCLUDED.tup_sponsorship_number
      ELSE tbl_user_profiles.tup_sponsorship_number
    END,
    tup_updated_at = now();

  UPDATE public.tbl_users
  SET
    tu_referrer_id = v_sponsor_id,
    tu_updated_at = now()
  WHERE tu_id = p_user_id;

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

GRANT EXECUTE ON FUNCTION public.is_user_launch_eligible(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_completed_launch_upgrade(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_sponsor_status_by_sponsorship_number(text) TO anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.get_sponsor_by_sponsorship_number(text) TO anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.register_customer(uuid, text, text, text, text, text, text, text) TO authenticated, anon;
