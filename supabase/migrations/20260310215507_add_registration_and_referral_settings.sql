/*
  # Add Registration Fee and Referral Settings

  1. Changes
    - Add registration fee amount to system settings
    - Add direct referral commission amount to system settings
    - Add default admin wallet for receiving payments
    - Ensure subscription plans table properly supports registration vs upgrade types
  
  2. Security
    - Settings are admin-controlled only
    - No user access to modify these settings
*/

-- Add registration and referral settings to system settings if they don't exist
DO $$
BEGIN
  -- Check if registration_fee setting exists
  IF NOT EXISTS (
    SELECT 1 FROM tbl_system_settings WHERE tss_setting_key = 'registration_fee'
  ) THEN
    INSERT INTO tbl_system_settings (tss_setting_key, tss_setting_value, tss_description)
    VALUES (
      'registration_fee',
      '5'::jsonb,
      'Registration fee amount in USD that new users must pay'
    );
  END IF;

  -- Check if direct_referral_commission setting exists
  IF NOT EXISTS (
    SELECT 1 FROM tbl_system_settings WHERE tss_setting_key = 'direct_referral_commission'
  ) THEN
    INSERT INTO tbl_system_settings (tss_setting_key, tss_setting_value, tss_description)
    VALUES (
      'direct_referral_commission',
      '2'::jsonb,
      'Direct referral commission amount in USD paid to referrer'
    );
  END IF;

  -- Check if admin_payment_wallet setting exists
  IF NOT EXISTS (
    SELECT 1 FROM tbl_system_settings WHERE tss_setting_key = 'admin_payment_wallet'
  ) THEN
    INSERT INTO tbl_system_settings (tss_setting_key, tss_setting_value, tss_description)
    VALUES (
      'admin_payment_wallet',
      '""'::jsonb,
      'Admin SafePal wallet address for receiving registration payments'
    );
  END IF;

  -- Check if payment_wallets_enabled setting exists
  IF NOT EXISTS (
    SELECT 1 FROM tbl_system_settings WHERE tss_setting_key = 'payment_wallets_enabled'
  ) THEN
    INSERT INTO tbl_system_settings (tss_setting_key, tss_setting_value, tss_description)
    VALUES (
      'payment_wallets_enabled',
      '{"trust_wallet": true, "metamask": true, "safepal": true}'::jsonb,
      'Enabled payment wallet types for user payments'
    );
  END IF;
END $$;

-- Ensure default registration plan exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM tbl_subscription_plans WHERE tsp_type = 'registration'
  ) THEN
    INSERT INTO tbl_subscription_plans (
      tsp_name,
      tsp_description,
      tsp_price,
      tsp_duration_days,
      tsp_features,
      tsp_is_active,
      tsp_type
    ) VALUES (
      'Registration Plan',
      'One-time registration fee to join the platform',
      5.00,
      365,
      '{"referral_income": true, "mlm_tree": true, "daily_tasks": true, "coupon_interactions": true}'::jsonb,
      true,
      'registration'
    );
  END IF;
END $$;