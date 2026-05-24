-- Add the separate datetime that controls when users start seeing the
-- upcoming maintenance notification.

INSERT INTO tbl_system_settings (tss_setting_key, tss_setting_value, tss_description)
SELECT
  'maintenance_notice_show_from_at',
  'null'::jsonb,
  'Datetime when frontend users start seeing the upcoming maintenance notification'
WHERE NOT EXISTS (
  SELECT 1 FROM tbl_system_settings WHERE tss_setting_key = 'maintenance_notice_show_from_at'
);
