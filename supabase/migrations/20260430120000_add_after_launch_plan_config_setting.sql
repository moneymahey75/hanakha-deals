-- Add After Launch Plan configuration (JSON)
-- Avoid DO $$ blocks to prevent dollar-quote issues.

INSERT INTO tbl_system_settings (tss_setting_key, tss_setting_value, tss_description)
SELECT
  'after_launch_plan_config',
  jsonb_build_object(
    'planTitle', 'SHOPCLIX Plan (Launch)',
    'joiningPacks', jsonb_build_array(50, 100, 200),
    'couponDays', 200,
    'roi', jsonb_build_object(
      'dailyPercent', 1,
      'durationDays', 200,
      'targetMultiplier', 2
    ),
    'directIncome', jsonb_build_array(
      jsonb_build_object('label', '1st level (Direct)', 'percent', 7, 'requiresDirect', 0),
      jsonb_build_object('label', '2nd level (Direct)', 'percent', 1.5, 'requiresDirect', 3),
      jsonb_build_object('label', '3rd level (Direct)', 'percent', 1, 'requiresDirect', 9)
    ),
    'levelIncome', jsonb_build_array(
      jsonb_build_object('level', 1, 'percent', '10%'),
      jsonb_build_object('level', 2, 'percent', '5%'),
      jsonb_build_object('level', 3, 'percent', '3%'),
      jsonb_build_object('level', 4, 'percent', '2%'),
      jsonb_build_object('level', 5, 'percent', '1%'),
      jsonb_build_object('level', 6, 'percent', '1%'),
      jsonb_build_object('level', 7, 'percent', '1%'),
      jsonb_build_object('level', 8, 'percent', '1%'),
      jsonb_build_object('level', 9, 'percent', '1%'),
      jsonb_build_object('level', 10, 'percent', '2%'),
      jsonb_build_object('level', 11, 'percent', '1%'),
      jsonb_build_object('level', 12, 'percent', '1%'),
      jsonb_build_object('level', 13, 'percent', '2%'),
      jsonb_build_object('level', 14, 'percent', '2%'),
      jsonb_build_object('level', 15, 'percent', '2%')
    ),
    'packLevelsNote', 'Pack levels: 50 USDT pack = 7 levels • 100 USDT pack = 10 levels • 200 USDT pack = 15 levels',
    'levelUnlockRules', jsonb_build_array(
      'You can open your 1 level with 1 direct only.',
      '9 direct = 9 levels open.',
      '10 direct = 15 levels open.'
    )
  ),
  'Configurable content for the After Launch Plan section shown on the Plans page'
WHERE NOT EXISTS (
  SELECT 1 FROM tbl_system_settings WHERE tss_setting_key = 'after_launch_plan_config'
);

