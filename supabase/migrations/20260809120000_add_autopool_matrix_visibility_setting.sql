-- Ensure the customer AutoPool details table has an admin-controlled setting.

INSERT INTO public.tbl_system_settings (
  tss_setting_key,
  tss_setting_value,
  tss_description
)
VALUES (
  'autopool_user_counts_enabled',
  'true'::jsonb,
  'Show customers their eight-level AutoPool matrix progress table'
)
ON CONFLICT (tss_setting_key) DO NOTHING;

NOTIFY pgrst, 'reload schema';
