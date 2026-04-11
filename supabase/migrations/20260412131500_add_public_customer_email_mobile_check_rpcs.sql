/*
  # Public RPCs for customer email/mobile uniqueness checks

  Customer registration runs as anon, so direct SELECTs may be blocked by RLS.
  These SECURITY DEFINER SQL functions provide safe existence checks that can be
  called from the client during registration (similar to `check_username_exists`).
*/

-- Check if an email exists for any user type (used to avoid Supabase Auth duplicate email errors)
DROP FUNCTION IF EXISTS public.check_email_exists(text);
CREATE OR REPLACE FUNCTION public.check_email_exists(p_email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS 'SELECT EXISTS (
  SELECT 1
  FROM tbl_users u
  WHERE lower(btrim(u.tu_email)) = lower(btrim(p_email))
)';

REVOKE ALL ON FUNCTION public.check_email_exists(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_email_exists(text) TO anon;
GRANT EXECUTE ON FUNCTION public.check_email_exists(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_email_exists(text) TO service_role;

COMMENT ON FUNCTION public.check_email_exists(text) IS 'Returns true if the email is already present in tbl_users (any user type).';

-- Check if an email exists for a customer (used when customerEmailUnique is enabled)
DROP FUNCTION IF EXISTS public.check_customer_email_exists(text);
CREATE OR REPLACE FUNCTION public.check_customer_email_exists(p_email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS 'SELECT EXISTS (
  SELECT 1
  FROM tbl_users u
  WHERE u.tu_user_type = ''customer''
    AND lower(btrim(u.tu_email)) = lower(btrim(p_email))
)';

REVOKE ALL ON FUNCTION public.check_customer_email_exists(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_customer_email_exists(text) TO anon;
GRANT EXECUTE ON FUNCTION public.check_customer_email_exists(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_customer_email_exists(text) TO service_role;

COMMENT ON FUNCTION public.check_customer_email_exists(text) IS 'Returns true if the email is already used by a customer.';

-- Check if a mobile exists for a customer (mobile stored in tbl_user_profiles)
DROP FUNCTION IF EXISTS public.check_customer_mobile_exists(text);
CREATE OR REPLACE FUNCTION public.check_customer_mobile_exists(p_mobile text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS 'SELECT EXISTS (
  SELECT 1
  FROM tbl_user_profiles up
  JOIN tbl_users u ON u.tu_id = up.tup_user_id
  WHERE u.tu_user_type = ''customer''
    AND btrim(up.tup_mobile) = btrim(p_mobile)
)';

REVOKE ALL ON FUNCTION public.check_customer_mobile_exists(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_customer_mobile_exists(text) TO anon;
GRANT EXECUTE ON FUNCTION public.check_customer_mobile_exists(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_customer_mobile_exists(text) TO service_role;

COMMENT ON FUNCTION public.check_customer_mobile_exists(text) IS 'Returns true if the mobile is already used by a customer.';
