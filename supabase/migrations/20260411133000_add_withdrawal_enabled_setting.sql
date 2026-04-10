/*
  # Add withdrawal enabled toggle + disabled message

  Admin can disable withdrawals temporarily and provide a custom message shown to customers.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM tbl_system_settings WHERE tss_setting_key = 'withdrawal_enabled'
  ) THEN
    INSERT INTO tbl_system_settings (tss_setting_key, tss_setting_value, tss_description)
    VALUES (
      'withdrawal_enabled',
      'true'::jsonb,
      'Whether customer withdrawals are enabled'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM tbl_system_settings WHERE tss_setting_key = 'withdrawal_disabled_message'
  ) THEN
    INSERT INTO tbl_system_settings (tss_setting_key, tss_setting_value, tss_description)
    VALUES (
      'withdrawal_disabled_message',
      '"Withdrawals are temporarily disabled. Please try again later."'::jsonb,
      'Message shown to customers when withdrawals are disabled'
    );
  END IF;
END $$;

