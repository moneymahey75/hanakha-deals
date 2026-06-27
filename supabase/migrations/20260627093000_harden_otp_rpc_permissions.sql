-- Harden legacy OTP access so browsers cannot create, read, verify, or delete OTP records directly.
-- OTP mutations now go through authenticated edge functions using the service role.

REVOKE ALL ON TABLE public.tbl_otp_verifications FROM anon;
REVOKE ALL ON TABLE public.tbl_otp_verifications FROM authenticated;
GRANT ALL ON TABLE public.tbl_otp_verifications TO service_role;

DROP POLICY IF EXISTS "anon_can_insert_otp" ON public.tbl_otp_verifications;
DROP POLICY IF EXISTS "authenticated_can_insert_otp" ON public.tbl_otp_verifications;
DROP POLICY IF EXISTS "users_can_select_own_otp" ON public.tbl_otp_verifications;
DROP POLICY IF EXISTS "users_can_update_own_otp" ON public.tbl_otp_verifications;
DROP POLICY IF EXISTS "users_can_delete_own_otp" ON public.tbl_otp_verifications;
DROP POLICY IF EXISTS "user_delete_own" ON public.tbl_otp_verifications;

DO $$
DECLARE
  function_signature text;
  function_regprocedure regprocedure;
BEGIN
  FOREACH function_signature IN ARRAY ARRAY[
    'public.verify_otp_and_update_user(uuid,uuid,text)',
    'public.invalidate_user_otps(uuid,text)',
    'public.create_otp_record(uuid,text,text,text,timestamptz)',
    'public.mark_otp_verified(uuid,uuid,text)',
    'public.delete_otp_record(uuid)',
    'public.delete_user_otps(uuid,text)',
    'public.delete_expired_otps()'
  ]
  LOOP
    function_regprocedure := to_regprocedure(function_signature);

    IF function_regprocedure IS NOT NULL THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', function_regprocedure);
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', function_regprocedure);
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated', function_regprocedure);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', function_regprocedure);
    END IF;
  END LOOP;
END $$;
