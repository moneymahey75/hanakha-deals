-- Restrict public reads of system settings to non-sensitive keys only.
-- Admin edge functions use the service role key and continue to read/write all settings.

DO $$
DECLARE
  policy_record record;
BEGIN
  FOR policy_record IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'tbl_system_settings'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.tbl_system_settings', policy_record.policyname);
  END LOOP;
END $$;

ALTER TABLE public.tbl_system_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "system_settings_service_role_full_access"
  ON public.tbl_system_settings
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "system_settings_super_admin_full_access"
  ON public.tbl_system_settings
  FOR ALL
  TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

CREATE POLICY "system_settings_sub_admin_insert"
  ON public.tbl_system_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (is_sub_admin());

CREATE POLICY "system_settings_sub_admin_update"
  ON public.tbl_system_settings
  FOR UPDATE
  TO authenticated
  USING (is_sub_admin())
  WITH CHECK (is_sub_admin());

CREATE POLICY "system_settings_public_safe_select"
  ON public.tbl_system_settings
  FOR SELECT
  TO anon, authenticated
  USING (
    tss_setting_key IN (
      'site_name',
      'logo_url',
      'date_format',
      'timezone',
      'maintenance_mode',
      'maintenance_message',
      'maintenance_notice_enabled',
      'maintenance_notice_message',
      'maintenance_window_start_at',
      'maintenance_window_end_at',
      'maintenance_allowed_ips',
      'contact_email',
      'contact_email_note',
      'contact_phone',
      'contact_phone_note',
      'contact_address',
      'contact_business_hours',
      'contact_quick_support_links',
      'social_facebook_url',
      'social_twitter_url',
      'social_linkedin_url',
      'social_instagram_url',
      'social_youtube_url',
      'social_whatsapp_url',
      'after_launch_plan_config',
      'launch_phase',
      'site_mode',
      'captcha_verification_enabled',
      'email_verification_required',
      'mobile_verification_required',
      'either_verification_required',
      'referral_mandatory',
      'customer_email_unique',
      'customer_mobile_unique',
      'job_seeker_video_url',
      'job_provider_video_url',
      'username_min_length',
      'username_max_length',
      'username_allow_spaces',
      'username_allow_special_chars',
      'username_allowed_special_chars',
      'username_force_lower_case',
      'username_unique_required',
      'username_allow_numbers',
      'username_must_start_with_letter',
      'password_min_length',
      'password_max_length',
      'password_require_uppercase',
      'password_require_lowercase',
      'password_require_numbers',
      'password_require_special_chars',
      'password_allowed_special_chars',
      'password_prevent_common',
      'password_prevent_sequences',
      'password_prevent_repeats',
      'password_max_consecutive',
      'password_min_unique_chars'
    )
  );

DO $$
BEGIN
  IF to_regprocedure('public.admin_get_system_settings()') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.admin_get_system_settings() FROM anon, authenticated;
  END IF;
END $$;
