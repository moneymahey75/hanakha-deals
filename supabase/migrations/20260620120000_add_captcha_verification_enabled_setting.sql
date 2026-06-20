INSERT INTO public.tbl_system_settings (tss_setting_key, tss_setting_value, tss_description)
SELECT
  'captcha_verification_enabled',
  to_jsonb(true),
  'Enable or disable captcha verification on public forms'
WHERE NOT EXISTS (
  SELECT 1
  FROM public.tbl_system_settings
  WHERE tss_setting_key = 'captcha_verification_enabled'
);
