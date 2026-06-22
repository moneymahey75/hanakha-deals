-- Use India Standard Time for database/session display and now() rendering.
-- timestamptz values remain absolute moments internally; this controls session timezone.

ALTER DATABASE postgres SET timezone TO 'Asia/Kolkata';

DO $$
DECLARE
  v_role text;
BEGIN
  FOREACH v_role IN ARRAY ARRAY['postgres', 'authenticator', 'anon', 'authenticated', 'service_role']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_role) THEN
      EXECUTE format('ALTER ROLE %I SET timezone TO %L', v_role, 'Asia/Kolkata');
    END IF;
  END LOOP;
END;
$$;

INSERT INTO public.tbl_system_settings (tss_setting_key, tss_setting_value, tss_updated_at)
VALUES ('timezone', 'Asia/Kolkata', now())
ON CONFLICT (tss_setting_key)
DO UPDATE SET
  tss_setting_value = EXCLUDED.tss_setting_value,
  tss_updated_at = now();

NOTIFY pgrst, 'reload schema';
