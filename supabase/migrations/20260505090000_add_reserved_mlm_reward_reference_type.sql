-- Allow MLM milestone rewards to be split into withdrawable and reserved upgrade balances.
ALTER TABLE tbl_wallet_transactions
  DROP CONSTRAINT IF EXISTS tbl_wallet_transactions_twt_reference_type_check;

ALTER TABLE tbl_wallet_transactions
  ADD CONSTRAINT tbl_wallet_transactions_twt_reference_type_check
  CHECK (
    twt_reference_type IN (
      'task_reward',
      'coupon_share',
      'social_share',
      'admin_credit',
      'withdrawal',
      'deposit',
      'transfer',
      'registration_parent_income',
      'registration_parent_income_reserved',
      'registration_payment',
      'upgrade_from_reserved',
      'mlm_level_reward_5_15_30',
      'mlm_level_reward_15_45_90',
      'mlm_level_reward',
      'mlm_level_reward_reserved'
    )
  );
