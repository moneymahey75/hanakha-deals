-- Track which admin processed/verified a payment
ALTER TABLE IF EXISTS tbl_payments
  ADD COLUMN IF NOT EXISTS tp_processed_by_admin_id UUID,
  ADD COLUMN IF NOT EXISTS tp_processed_by_admin_email TEXT,
  ADD COLUMN IF NOT EXISTS tp_processed_by_admin_name TEXT;
