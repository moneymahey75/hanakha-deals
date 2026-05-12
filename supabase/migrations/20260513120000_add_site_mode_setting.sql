INSERT INTO tbl_system_settings (tss_setting_key, tss_setting_value, tss_description)
SELECT
  'site_mode',
  to_jsonb('live'::text),
  'Current site mode: live or development'
WHERE NOT EXISTS (
  SELECT 1 FROM tbl_system_settings WHERE tss_setting_key = 'site_mode'
);

UPDATE tbl_system_settings
SET tss_description = 'Current launch phase: prelaunch or launched'
WHERE tss_setting_key = 'launch_phase';
