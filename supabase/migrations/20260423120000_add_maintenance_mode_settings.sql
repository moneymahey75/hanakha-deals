/*
  # Add maintenance mode settings

  Allows admins to enable maintenance mode for the public site and set a message.
*/

INSERT INTO tbl_system_settings (tss_setting_key, tss_setting_value, tss_description)
SELECT
  'maintenance_mode',
  to_jsonb(false),
  'Whether the public site is in maintenance mode'
WHERE NOT EXISTS (
  SELECT 1 FROM tbl_system_settings WHERE tss_setting_key = 'maintenance_mode'
);

INSERT INTO tbl_system_settings (tss_setting_key, tss_setting_value, tss_description)
SELECT
  'maintenance_message',
  to_jsonb('We''re doing some maintenance right now. Please check back shortly.'::text),
  'Message shown on the maintenance page'
WHERE NOT EXISTS (
  SELECT 1 FROM tbl_system_settings WHERE tss_setting_key = 'maintenance_message'
);
