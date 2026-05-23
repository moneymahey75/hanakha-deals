/*
  Launch sponsor and earning eligibility.

  When launch_phase = launched, Pre-Launch users keep historical data but cannot
  earn, participate in active referral calculations, or be used as sponsors until
  they upgrade to an active Launch plan.
*/

CREATE OR REPLACE FUNCTION public.is_launch_phase_active()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT lower(trim(both '"' from tss_setting_value::text)) = 'launched'
      FROM public.tbl_system_settings
      WHERE tss_setting_key = 'launch_phase'
      LIMIT 1
    ),
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.is_user_launch_eligible(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    CASE
      WHEN NOT public.is_launch_phase_active() THEN true
      ELSE public.is_user_on_launch_plan(p_user_id)
    END;
$$;

CREATE OR REPLACE FUNCTION public.is_user_active_member(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
SELECT EXISTS (
  SELECT 1
  FROM public.tbl_users u
  WHERE u.tu_id = p_user_id
    AND COALESCE(u.tu_is_active, false) = true
    AND COALESCE(u.tu_registration_paid, false) = true
    AND public.meets_current_verification_requirements(u.tu_email_verified, u.tu_mobile_verified)
    AND public.is_user_launch_eligible(u.tu_id)
)
$$;

DROP FUNCTION IF EXISTS public.get_sponsor_status_by_sponsorship_number(text);

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
    u.tu_is_active AS is_active,
    u.tu_registration_paid AS is_registration_paid,
    u.tu_email_verified AS email_verified,
    u.tu_mobile_verified AS mobile_verified,
    public.is_user_launch_eligible(u.tu_id) AS is_launch_eligible,
    public.get_user_active_plan_phase(u.tu_id) AS current_plan_phase,
    public.is_launch_phase_active() AS launch_phase_active
  FROM public.tbl_user_profiles p
  INNER JOIN public.tbl_users u ON u.tu_id = p.tup_user_id
  WHERE p.tup_sponsorship_number = p_sponsorship_number
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
  WHERE p.tup_sponsorship_number = p_sponsorship_number
    AND u.tu_is_active = true
    AND u.tu_user_type = 'customer'
    AND public.is_user_launch_eligible(u.tu_id)
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_launch_phase_active() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_user_launch_eligible(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_user_active_member(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_sponsor_status_by_sponsorship_number(text) TO anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.get_sponsor_by_sponsorship_number(text) TO anon, authenticated, public;

COMMENT ON FUNCTION public.get_sponsor_status_by_sponsorship_number(text) IS
  'Public sponsor validation. In Launch mode, sponsor must have an active Launch plan.';

