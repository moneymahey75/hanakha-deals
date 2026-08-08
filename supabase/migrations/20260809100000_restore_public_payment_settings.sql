-- Restore the non-secret payment settings required by customer payment pages.
-- The AutoPool withdrawal policy migration replaced this policy without retaining
-- the network, token, receiving-wallet, and enabled-wallet display settings.

DROP POLICY IF EXISTS "system_settings_public_safe_select" ON public.tbl_system_settings;

CREATE POLICY "system_settings_public_safe_select"
  ON public.tbl_system_settings
  FOR SELECT
  TO anon, authenticated
  USING (
    tss_setting_key IN (
      'site_name', 'logo_url', 'date_format', 'timezone',
      'maintenance_mode', 'maintenance_message', 'maintenance_notice_enabled',
      'maintenance_notice_message', 'maintenance_window_start_at',
      'maintenance_window_end_at', 'maintenance_allowed_ips',
      'contact_email', 'contact_email_note', 'contact_phone', 'contact_phone_note',
      'contact_address', 'contact_business_hours', 'contact_quick_support_links',
      'social_facebook_url', 'social_twitter_url', 'social_linkedin_url',
      'social_instagram_url', 'social_youtube_url', 'social_whatsapp_url',
      'after_launch_plan_config', 'home_autopool_popup_enabled', 'launch_phase',
      'site_mode', 'captcha_verification_enabled', 'email_verification_required',
      'mobile_verification_required', 'either_verification_required',
      'referral_mandatory', 'customer_email_unique', 'customer_mobile_unique',
      'job_seeker_video_url', 'job_provider_video_url', 'username_min_length',
      'username_max_length', 'username_allow_spaces',
      'username_allow_special_chars', 'username_allowed_special_chars',
      'username_force_lower_case', 'username_unique_required',
      'username_allow_numbers', 'username_must_start_with_letter',
      'password_min_length', 'password_max_length', 'password_require_uppercase',
      'password_require_lowercase', 'password_require_numbers',
      'password_require_special_chars', 'password_allowed_special_chars',
      'password_prevent_common', 'password_prevent_sequences',
      'password_prevent_repeats', 'password_max_consecutive',
      'password_min_unique_chars',
      'payment_mode', 'usdt_address', 'usdt_address_testnet',
      'usdt_address_mainnet', 'admin_payment_wallet',
      'admin_payment_wallet_testnet', 'admin_payment_wallet_mainnet',
      'payment_wallets_enabled',
      'withdrawal_enabled', 'withdrawal_disabled_message', 'withdrawal_min_amount',
      'reward_withdrawal_min_amount', 'autopool_withdrawal_min_amount',
      'withdrawal_step_amount', 'withdrawal_commission_percent',
      'withdrawal_auto_transfer', 'withdrawal_processing_days'
    )
  );

NOTIFY pgrst, 'reload schema';
