/*
  # Network-specific USDT + receiving wallet settings

  Users can have multiple "USDT" tokens in MetaMask (different contract addresses).
  The app must use the configured contract address for the currently selected Payment Mode.

  This migration adds separate keys for Testnet/Mainnet, defaulting to the existing
  single-key values when present.
*/

INSERT INTO tbl_system_settings (tss_setting_key, tss_setting_value, tss_description)
SELECT
  'usdt_address_testnet',
  COALESCE(
    (SELECT tss_setting_value FROM tbl_system_settings WHERE tss_setting_key = 'usdt_address'),
    '""'::jsonb
  ),
  'USDT contract address for testnet (BSC Testnet)'
WHERE NOT EXISTS (
  SELECT 1 FROM tbl_system_settings WHERE tss_setting_key = 'usdt_address_testnet'
);

INSERT INTO tbl_system_settings (tss_setting_key, tss_setting_value, tss_description)
SELECT
  'usdt_address_mainnet',
  COALESCE(
    (SELECT tss_setting_value FROM tbl_system_settings WHERE tss_setting_key = 'usdt_address'),
    '""'::jsonb
  ),
  'USDT contract address for mainnet (BSC Mainnet)'
WHERE NOT EXISTS (
  SELECT 1 FROM tbl_system_settings WHERE tss_setting_key = 'usdt_address_mainnet'
);

INSERT INTO tbl_system_settings (tss_setting_key, tss_setting_value, tss_description)
SELECT
  'admin_payment_wallet_testnet',
  COALESCE(
    (SELECT tss_setting_value FROM tbl_system_settings WHERE tss_setting_key = 'admin_payment_wallet'),
    '""'::jsonb
  ),
  'Registration payment receiving wallet for testnet'
WHERE NOT EXISTS (
  SELECT 1 FROM tbl_system_settings WHERE tss_setting_key = 'admin_payment_wallet_testnet'
);

INSERT INTO tbl_system_settings (tss_setting_key, tss_setting_value, tss_description)
SELECT
  'admin_payment_wallet_mainnet',
  COALESCE(
    (SELECT tss_setting_value FROM tbl_system_settings WHERE tss_setting_key = 'admin_payment_wallet'),
    '""'::jsonb
  ),
  'Registration payment receiving wallet for mainnet'
WHERE NOT EXISTS (
  SELECT 1 FROM tbl_system_settings WHERE tss_setting_key = 'admin_payment_wallet_mainnet'
);

