INSERT INTO tbl_system_settings (tss_setting_key, tss_setting_value, tss_description)
SELECT
  'launch_phase',
  to_jsonb('prelaunch'::text),
  'Current launch phase: prelaunch or launched'
WHERE NOT EXISTS (
  SELECT 1 FROM tbl_system_settings WHERE tss_setting_key = 'launch_phase'
);

