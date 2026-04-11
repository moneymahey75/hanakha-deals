/*
  # Customer email/mobile uniqueness settings

  Admin-configurable toggles for enforcing uniqueness on customer email/mobile.
*/

INSERT INTO tbl_system_settings (tss_setting_key, tss_setting_value, tss_description)
SELECT
  'customer_email_unique',
  'true'::jsonb,
  'Require customer email to be unique (app-level)'
WHERE NOT EXISTS (
  SELECT 1 FROM tbl_system_settings WHERE tss_setting_key = 'customer_email_unique'
);

INSERT INTO tbl_system_settings (tss_setting_key, tss_setting_value, tss_description)
SELECT
  'customer_mobile_unique',
  'true'::jsonb,
  'Require customer mobile to be unique'
WHERE NOT EXISTS (
  SELECT 1 FROM tbl_system_settings WHERE tss_setting_key = 'customer_mobile_unique'
);
