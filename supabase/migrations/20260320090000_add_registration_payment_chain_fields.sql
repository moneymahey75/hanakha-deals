-- Add blockchain-specific fields for registration payments
ALTER TABLE IF EXISTS tbl_payments
  ADD COLUMN IF NOT EXISTS tp_wallet_address TEXT,
  ADD COLUMN IF NOT EXISTS tp_to_address TEXT,
  ADD COLUMN IF NOT EXISTS tp_network TEXT,
  ADD COLUMN IF NOT EXISTS tp_chain_id INTEGER,
  ADD COLUMN IF NOT EXISTS tp_block_number BIGINT,
  ADD COLUMN IF NOT EXISTS tp_confirmations INTEGER,
  ADD COLUMN IF NOT EXISTS tp_expected_amount NUMERIC,
  ADD COLUMN IF NOT EXISTS tp_amount_received NUMERIC,
  ADD COLUMN IF NOT EXISTS tp_verified_at TIMESTAMPTZ;

-- Prevent duplicate transaction hashes
CREATE UNIQUE INDEX IF NOT EXISTS uq_tbl_payments_tx_hash
  ON tbl_payments (tp_transaction_id)
  WHERE tp_transaction_id IS NOT NULL;
