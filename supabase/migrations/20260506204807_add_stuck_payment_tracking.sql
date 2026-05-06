/*
  # Add stuck payment tracking to tbl_payments

  1. Changes to tbl_payments
    - `tp_is_stuck` (boolean, default false) — set true when payment is recorded as stuck
      (USDT deducted but verification failed or timed out)
    - `tp_stuck_at` (timestamptz) — when the payment became stuck
    - `tp_wallet_error_code` (text) — raw error code from wallet (e.g. 4001, WALLET_RESPONSE_TIMEOUT)
    - `tp_wallet_error_raw` (text) — full raw error message from the wallet/provider
    - `tp_device_info` (text) — browser/device identifier to help diagnose platform-specific issues

  2. Index
    - Index on (tp_is_stuck, tp_payment_status) for fast admin queries
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tbl_payments' AND column_name = 'tp_is_stuck'
  ) THEN
    ALTER TABLE tbl_payments ADD COLUMN tp_is_stuck boolean NOT NULL DEFAULT false;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tbl_payments' AND column_name = 'tp_stuck_at'
  ) THEN
    ALTER TABLE tbl_payments ADD COLUMN tp_stuck_at timestamptz DEFAULT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tbl_payments' AND column_name = 'tp_wallet_error_code'
  ) THEN
    ALTER TABLE tbl_payments ADD COLUMN tp_wallet_error_code text DEFAULT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tbl_payments' AND column_name = 'tp_wallet_error_raw'
  ) THEN
    ALTER TABLE tbl_payments ADD COLUMN tp_wallet_error_raw text DEFAULT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tbl_payments' AND column_name = 'tp_device_info'
  ) THEN
    ALTER TABLE tbl_payments ADD COLUMN tp_device_info text DEFAULT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_tbl_payments_stuck
  ON tbl_payments (tp_is_stuck, tp_payment_status);
