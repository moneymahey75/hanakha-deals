-- Ensure one payment record per blockchain transaction hash
CREATE UNIQUE INDEX IF NOT EXISTS idx_tbl_payments_tx_hash_unique
  ON tbl_payments (tp_transaction_id)
  WHERE tp_transaction_id IS NOT NULL;
