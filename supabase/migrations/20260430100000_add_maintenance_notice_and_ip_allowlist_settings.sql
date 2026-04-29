-- Add maintenance notice and scheduled maintenance window settings
-- Avoid DO $$ blocks to prevent copy/paste issues with dollar-quoting.

INSERT INTO tbl_system_settings (tss_setting_key, tss_setting_value, tss_description)
SELECT
  'maintenance_notice_enabled',
  to_jsonb(false),
  'Whether to show a maintenance notice banner to users'
WHERE NOT EXISTS (
  SELECT 1 FROM tbl_system_settings WHERE tss_setting_key = 'maintenance_notice_enabled'
);

INSERT INTO tbl_system_settings (tss_setting_key, tss_setting_value, tss_description)
SELECT
  'maintenance_notice_message',
  to_jsonb(''::text),
  'Custom message shown in the maintenance notice banner'
WHERE NOT EXISTS (
  SELECT 1 FROM tbl_system_settings WHERE tss_setting_key = 'maintenance_notice_message'
);

INSERT INTO tbl_system_settings (tss_setting_key, tss_setting_value, tss_description)
SELECT
  'maintenance_window_start_at',
  'null'::jsonb,
  'Scheduled maintenance start time (ISO string) or null'
WHERE NOT EXISTS (
  SELECT 1 FROM tbl_system_settings WHERE tss_setting_key = 'maintenance_window_start_at'
);

INSERT INTO tbl_system_settings (tss_setting_key, tss_setting_value, tss_description)
SELECT
  'maintenance_window_end_at',
  'null'::jsonb,
  'Scheduled maintenance end time (ISO string) or null'
WHERE NOT EXISTS (
  SELECT 1 FROM tbl_system_settings WHERE tss_setting_key = 'maintenance_window_end_at'
);

INSERT INTO tbl_system_settings (tss_setting_key, tss_setting_value, tss_description)
SELECT
  'maintenance_allowed_ips',
  to_jsonb(ARRAY[]::text[]),
  'IP allowlist that can bypass maintenance window/mode'
WHERE NOT EXISTS (
  SELECT 1 FROM tbl_system_settings WHERE tss_setting_key = 'maintenance_allowed_ips'
);
