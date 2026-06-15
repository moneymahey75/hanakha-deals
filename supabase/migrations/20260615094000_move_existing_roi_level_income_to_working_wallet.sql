-- Move historical ROI-to-ROI level income from reward/non-working wallets to working wallets.
-- Daily ROI coupon transactions use reference_type = 'reward_coupon' and are intentionally untouched.

WITH roi_level_reward_wallet_transactions AS (
  SELECT
    tx.twt_id,
    tx.twt_user_id,
    tx.twt_wallet_id AS old_reward_wallet_id,
    tx.twt_amount
  FROM public.tbl_wallet_transactions tx
  JOIN public.tbl_wallets wallet ON wallet.tw_id = tx.twt_wallet_id
  WHERE tx.twt_reference_type = 'roi_level_income'
    AND tx.twt_transaction_type = 'credit'
    AND tx.twt_status = 'completed'
    AND wallet.tw_wallet_type = 'reward'
),
working_wallets AS (
  SELECT
    candidate.twt_user_id,
    public.ensure_working_wallet(candidate.twt_user_id) AS working_wallet_id
  FROM (
    SELECT DISTINCT twt_user_id
    FROM roi_level_reward_wallet_transactions
  ) candidate
),
moved_transactions AS (
  UPDATE public.tbl_wallet_transactions tx
  SET twt_wallet_id = ww.working_wallet_id
  FROM roi_level_reward_wallet_transactions candidate
  JOIN working_wallets ww ON ww.twt_user_id = candidate.twt_user_id
  WHERE tx.twt_id = candidate.twt_id
    AND tx.twt_wallet_id = candidate.old_reward_wallet_id
  RETURNING
    tx.twt_id,
    tx.twt_user_id,
    candidate.old_reward_wallet_id,
    ww.working_wallet_id,
    candidate.twt_amount
),
reward_wallet_balance_updates AS (
  UPDATE public.tbl_wallets wallet
  SET
    tw_balance = GREATEST(
      0,
      COALESCE(wallet.tw_balance, 0) - COALESCE(moved.total_amount, 0)
    ),
    tw_updated_at = now()
  FROM (
    SELECT old_reward_wallet_id, SUM(twt_amount) AS total_amount
    FROM moved_transactions
    GROUP BY old_reward_wallet_id
  ) moved
  WHERE wallet.tw_id = moved.old_reward_wallet_id
  RETURNING wallet.tw_id
),
working_wallet_balance_updates AS (
  UPDATE public.tbl_wallets wallet
  SET
    tw_balance = COALESCE(wallet.tw_balance, 0) + COALESCE(moved.total_amount, 0),
    tw_updated_at = now()
  FROM (
    SELECT working_wallet_id, SUM(twt_amount) AS total_amount
    FROM moved_transactions
    GROUP BY working_wallet_id
  ) moved
  WHERE wallet.tw_id = moved.working_wallet_id
  RETURNING wallet.tw_id
)
SELECT
  COUNT(*) AS moved_roi_level_income_transaction_count,
  COALESCE(SUM(twt_amount), 0) AS moved_roi_level_income_total
FROM moved_transactions;
