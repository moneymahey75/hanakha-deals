/*
  # Add wallet type to withdrawals

  Lets users withdraw from working/non-working wallet independently.
*/

ALTER TABLE IF EXISTS public.tbl_withdrawal_requests
  ADD COLUMN IF NOT EXISTS twr_wallet_type text NOT NULL DEFAULT 'working';

ALTER TABLE IF EXISTS public.tbl_withdrawal_requests
  DROP CONSTRAINT IF EXISTS tbl_withdrawal_requests_wallet_type_check;

ALTER TABLE IF EXISTS public.tbl_withdrawal_requests
  ADD CONSTRAINT tbl_withdrawal_requests_wallet_type_check
  CHECK (twr_wallet_type IN ('working', 'non_working'));

CREATE INDEX IF NOT EXISTS idx_tbl_withdrawal_requests_wallet_type
  ON public.tbl_withdrawal_requests(twr_wallet_type);

