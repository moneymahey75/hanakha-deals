INSERT INTO public.tbl_system_settings (
  tss_setting_key,
  tss_setting_value,
  tss_description
)
VALUES
  (
    'withdrawal_min_amount',
    '10',
    'Minimum withdrawal amount in USDT'
  ),
  (
    'reward_withdrawal_min_amount',
    '10',
    'Minimum ROI Wallet withdrawal amount in USDT'
  ),
  (
    'withdrawal_step_amount',
    '10',
    'Withdrawal amount must be a multiple of this value'
  )
ON CONFLICT (tss_setting_key) DO UPDATE
SET
  tss_setting_value = EXCLUDED.tss_setting_value,
  tss_description = EXCLUDED.tss_description,
  tss_updated_at = now();
