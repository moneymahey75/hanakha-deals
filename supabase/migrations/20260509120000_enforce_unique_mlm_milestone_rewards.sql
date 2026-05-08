-- Enforce one MLM milestone reward payout per user per milestone.
-- The application already checks before inserting, but this protects against
-- concurrent payment verifications awarding the same milestone twice.

CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_mlm_milestone_reward_per_user
  ON tbl_wallet_transactions (twt_user_id, twt_reference_type, twt_reference_id)
  WHERE twt_reference_type IN ('mlm_level_reward', 'mlm_level_reward_reserved')
    AND twt_reference_id IS NOT NULL;
