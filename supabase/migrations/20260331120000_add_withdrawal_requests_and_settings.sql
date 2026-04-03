/*
  # Add Withdrawal Requests and Settings

  1. New Tables
    - tbl_withdrawal_requests

  2. Settings
    - withdrawal_min_amount
    - withdrawal_step_amount
    - withdrawal_commission_percent
    - withdrawal_auto_transfer
*/

-- Create withdrawal requests table
CREATE TABLE IF NOT EXISTS tbl_withdrawal_requests (
  twr_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  twr_user_id uuid NOT NULL REFERENCES tbl_users(tu_id) ON DELETE CASCADE,
  twr_wallet_connection_id uuid REFERENCES tbl_user_wallet_connections(tuwc_id) ON DELETE SET NULL,
  twr_destination_address text NOT NULL,
  twr_amount numeric(18,6) NOT NULL,
  twr_commission_percent numeric(6,3) NOT NULL DEFAULT 0,
  twr_commission_amount numeric(18,6) NOT NULL DEFAULT 0,
  twr_net_amount numeric(18,6) NOT NULL DEFAULT 0,
  twr_status text NOT NULL DEFAULT 'pending' CHECK (twr_status IN (
    'pending',
    'processing',
    'approved',
    'rejected',
    'completed',
    'failed',
    'cancelled'
  )),
  twr_auto_transfer boolean NOT NULL DEFAULT false,
  twr_requested_at timestamptz NOT NULL DEFAULT now(),
  twr_processed_at timestamptz,
  twr_processed_by_admin_id uuid REFERENCES tbl_admin_users(tau_id) ON DELETE SET NULL,
  twr_processed_by_admin_email text,
  twr_processed_by_admin_name text,
  twr_admin_note text,
  twr_blockchain_tx text,
  twr_failure_reason text
);

CREATE INDEX IF NOT EXISTS idx_tbl_withdrawal_requests_user_id
  ON tbl_withdrawal_requests(twr_user_id);

CREATE INDEX IF NOT EXISTS idx_tbl_withdrawal_requests_status
  ON tbl_withdrawal_requests(twr_status);

CREATE INDEX IF NOT EXISTS idx_tbl_withdrawal_requests_requested_at
  ON tbl_withdrawal_requests(twr_requested_at DESC);

ALTER TABLE tbl_withdrawal_requests ENABLE ROW LEVEL SECURITY;

-- RLS policies
DROP POLICY IF EXISTS "service_role_full_access" ON tbl_withdrawal_requests;
CREATE POLICY "service_role_full_access" ON tbl_withdrawal_requests
  FOR ALL
  TO authenticated, anon
  USING ((select current_setting('request.jwt.claims', true)::json->>'role') = 'service_role');

DROP POLICY IF EXISTS "user_insert_own" ON tbl_withdrawal_requests;
CREATE POLICY "user_insert_own" ON tbl_withdrawal_requests
  FOR INSERT
  TO authenticated, anon
  WITH CHECK ((select auth.uid()) = twr_user_id);

DROP POLICY IF EXISTS "user_select_own" ON tbl_withdrawal_requests;
CREATE POLICY "user_select_own" ON tbl_withdrawal_requests
  FOR SELECT
  TO authenticated, anon
  USING ((select auth.uid()) = twr_user_id);

DROP POLICY IF EXISTS "super_admin_full_access" ON tbl_withdrawal_requests;
CREATE POLICY "super_admin_full_access" ON tbl_withdrawal_requests
  FOR ALL
  TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS "sub_admin_select" ON tbl_withdrawal_requests;
CREATE POLICY "sub_admin_select" ON tbl_withdrawal_requests
  FOR SELECT
  TO authenticated
  USING (is_sub_admin());

DROP POLICY IF EXISTS "sub_admin_update" ON tbl_withdrawal_requests;
CREATE POLICY "sub_admin_update" ON tbl_withdrawal_requests
  FOR UPDATE
  TO authenticated
  USING (is_sub_admin())
  WITH CHECK (is_sub_admin());

-- Add withdrawal settings to system settings if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM tbl_system_settings WHERE tss_setting_key = 'withdrawal_min_amount'
  ) THEN
    INSERT INTO tbl_system_settings (tss_setting_key, tss_setting_value, tss_description)
    VALUES (
      'withdrawal_min_amount',
      '10'::jsonb,
      'Minimum withdrawal amount in USD'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM tbl_system_settings WHERE tss_setting_key = 'withdrawal_step_amount'
  ) THEN
    INSERT INTO tbl_system_settings (tss_setting_key, tss_setting_value, tss_description)
    VALUES (
      'withdrawal_step_amount',
      '10'::jsonb,
      'Withdrawal amount must be a multiple of this value'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM tbl_system_settings WHERE tss_setting_key = 'withdrawal_commission_percent'
  ) THEN
    INSERT INTO tbl_system_settings (tss_setting_key, tss_setting_value, tss_description)
    VALUES (
      'withdrawal_commission_percent',
      '0.5'::jsonb,
      'Site commission percentage charged on withdrawals'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM tbl_system_settings WHERE tss_setting_key = 'withdrawal_auto_transfer'
  ) THEN
    INSERT INTO tbl_system_settings (tss_setting_key, tss_setting_value, tss_description)
    VALUES (
      'withdrawal_auto_transfer',
      'false'::jsonb,
      'Whether withdrawal requests are auto-transferred without admin approval'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM tbl_system_settings WHERE tss_setting_key = 'withdrawal_processing_days'
  ) THEN
    INSERT INTO tbl_system_settings (tss_setting_key, tss_setting_value, tss_description)
    VALUES (
      'withdrawal_processing_days',
      '5'::jsonb,
      'Number of working days for processing withdrawal requests'
    );
  END IF;
END $$;
