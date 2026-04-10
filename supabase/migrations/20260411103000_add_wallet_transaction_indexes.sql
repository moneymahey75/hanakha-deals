-- Performance: wallet transaction pagination and sorting
CREATE INDEX IF NOT EXISTS idx_tbl_wallet_transactions_user_created_at
  ON tbl_wallet_transactions (twt_user_id, twt_created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tbl_wallet_transactions_wallet_created_at
  ON tbl_wallet_transactions (twt_wallet_id, twt_created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tbl_wallet_transactions_created_at
  ON tbl_wallet_transactions (twt_created_at DESC);

