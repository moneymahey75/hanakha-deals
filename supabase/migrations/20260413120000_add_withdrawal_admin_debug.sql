/*
  # Add admin debug field to withdrawals

  Stores raw/technical provider errors for admins (customers only see twr_failure_reason).
*/

ALTER TABLE tbl_withdrawal_requests
ADD COLUMN IF NOT EXISTS twr_admin_debug text;

