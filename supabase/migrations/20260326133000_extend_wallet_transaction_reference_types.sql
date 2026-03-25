-- Extend wallet transaction reference types to include registration commission entries
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
      'registration_payment'
    )
  );
