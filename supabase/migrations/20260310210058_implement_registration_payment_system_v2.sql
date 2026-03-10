/*
  # Implement Registration Payment System v2

  1. Changes
    - Add plan_type enum (registration, upgrade) to subscription plans
    - Keep existing subscription plans, add new registration plan ($5)
    - Update tbl_users to track registration payment status
    - Create referral income tracking table
    - Add function to process registration payment and referral income
    
  2. New Tables
    - `tbl_referral_income`
      - `tri_id` (uuid, primary key)
      - `tri_referrer_id` (uuid, references tbl_users) - who gets the income
      - `tri_referred_user_id` (uuid, references tbl_users) - who registered
      - `tri_amount` (numeric) - income amount ($2)
      - `tri_payment_status` (text) - pending, completed, failed
      - `tri_transaction_hash` (text) - blockchain transaction hash
      - `tri_created_at` (timestamp)
      - `tri_paid_at` (timestamp)
    
  3. Schema Updates
    - Add tsp_type to tbl_subscription_plans (registration or upgrade)
    - Add tu_registration_paid boolean to tbl_users
    - Add tu_registration_paid_at timestamp to tbl_users
    
  4. Security
    - Enable RLS on new table
    - Add appropriate policies
*/

-- Add plan type enum
DO $$ BEGIN
  CREATE TYPE plan_type AS ENUM ('registration', 'upgrade');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Add columns to subscription plans table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tbl_subscription_plans' AND column_name = 'tsp_type'
  ) THEN
    ALTER TABLE tbl_subscription_plans ADD COLUMN tsp_type plan_type DEFAULT 'upgrade';
  END IF;
END $$;

-- Mark existing plans as upgrade plans
UPDATE tbl_subscription_plans SET tsp_type = 'upgrade' WHERE tsp_type IS NULL;

-- Add registration payment tracking to users
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tbl_users' AND column_name = 'tu_registration_paid'
  ) THEN
    ALTER TABLE tbl_users ADD COLUMN tu_registration_paid boolean DEFAULT false;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tbl_users' AND column_name = 'tu_registration_paid_at'
  ) THEN
    ALTER TABLE tbl_users ADD COLUMN tu_registration_paid_at timestamptz;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tbl_users' AND column_name = 'tu_registration_tx_hash'
  ) THEN
    ALTER TABLE tbl_users ADD COLUMN tu_registration_tx_hash text;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tbl_users' AND column_name = 'tu_referrer_id'
  ) THEN
    ALTER TABLE tbl_users ADD COLUMN tu_referrer_id uuid REFERENCES tbl_users(tu_id);
  END IF;
END $$;

-- Create referral income tracking table
CREATE TABLE IF NOT EXISTS tbl_referral_income (
  tri_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tri_referrer_id uuid NOT NULL REFERENCES tbl_users(tu_id) ON DELETE CASCADE,
  tri_referred_user_id uuid NOT NULL REFERENCES tbl_users(tu_id) ON DELETE CASCADE,
  tri_amount numeric(10, 2) NOT NULL DEFAULT 2.00,
  tri_payment_status text NOT NULL DEFAULT 'pending' CHECK (tri_payment_status IN ('pending', 'completed', 'failed')),
  tri_transaction_hash text,
  tri_created_at timestamptz DEFAULT now(),
  tri_paid_at timestamptz,
  tri_notes text
);

-- Enable RLS
ALTER TABLE tbl_referral_income ENABLE ROW LEVEL SECURITY;

-- RLS Policies for referral income
DROP POLICY IF EXISTS "users_view_own_referral_income" ON tbl_referral_income;
DROP POLICY IF EXISTS "admin_full_referral_income" ON tbl_referral_income;

CREATE POLICY "users_view_own_referral_income"
  ON tbl_referral_income
  FOR SELECT
  TO authenticated
  USING (
    tri_referrer_id = auth.uid()
  );

CREATE POLICY "admin_full_referral_income"
  ON tbl_referral_income
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tbl_admin_users
      WHERE tau_auth_uid = auth.uid()
      AND tau_is_active = true
      AND tau_role IN ('super_admin', 'sub_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM tbl_admin_users
      WHERE tau_auth_uid = auth.uid()
      AND tau_is_active = true
      AND tau_role IN ('super_admin', 'sub_admin')
    )
  );

-- Insert registration plan ($5) if it doesn't exist
INSERT INTO tbl_subscription_plans (
  tsp_id,
  tsp_name,
  tsp_description,
  tsp_price,
  tsp_duration_days,
  tsp_features,
  tsp_type,
  tsp_is_active
)
SELECT
  gen_random_uuid(),
  'Registration Plan',
  'One-time registration fee to join the platform and start earning',
  5.00,
  0,
  '["Platform Access", "MLM Tree Placement", "Referral Link", "Dashboard Access", "Wallet Management", "Earn $2 Per Referral"]'::jsonb,
  'registration'::plan_type,
  true
WHERE NOT EXISTS (
  SELECT 1 FROM tbl_subscription_plans WHERE tsp_type = 'registration'
);

-- Function to process registration payment
CREATE OR REPLACE FUNCTION process_registration_payment(
  p_user_id uuid,
  p_transaction_hash text,
  p_referrer_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_user_exists boolean;
  v_already_paid boolean;
  v_referral_income_id uuid;
  v_result jsonb;
BEGIN
  -- Check if user exists
  SELECT EXISTS(SELECT 1 FROM tbl_users WHERE tu_id = p_user_id)
  INTO v_user_exists;
  
  IF NOT v_user_exists THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'User not found'
    );
  END IF;
  
  -- Check if already paid
  SELECT COALESCE(tu_registration_paid, false) INTO v_already_paid
  FROM tbl_users
  WHERE tu_id = p_user_id;
  
  IF v_already_paid THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Registration fee already paid'
    );
  END IF;
  
  -- Mark user as paid
  UPDATE tbl_users
  SET 
    tu_registration_paid = true,
    tu_registration_paid_at = now(),
    tu_registration_tx_hash = p_transaction_hash,
    tu_referrer_id = p_referrer_id,
    tu_is_active = true
  WHERE tu_id = p_user_id;
  
  -- If there's a referrer, create referral income record
  IF p_referrer_id IS NOT NULL THEN
    INSERT INTO tbl_referral_income (
      tri_referrer_id,
      tri_referred_user_id,
      tri_amount,
      tri_payment_status,
      tri_notes
    ) VALUES (
      p_referrer_id,
      p_user_id,
      2.00,
      'pending',
      'Direct referral income - $2 for registration'
    )
    RETURNING tri_id INTO v_referral_income_id;
    
    v_result := jsonb_build_object(
      'success', true,
      'message', 'Registration payment processed successfully',
      'referral_income_id', v_referral_income_id,
      'referral_amount', 2.00
    );
  ELSE
    v_result := jsonb_build_object(
      'success', true,
      'message', 'Registration payment processed successfully',
      'referral_income_id', null,
      'referral_amount', 0
    );
  END IF;
  
  RETURN v_result;
END;
$$;

-- Function to mark referral income as paid
CREATE OR REPLACE FUNCTION mark_referral_income_paid(
  p_income_id uuid,
  p_transaction_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_income_exists boolean;
  v_already_paid boolean;
BEGIN
  -- Check if income record exists
  SELECT 
    EXISTS(SELECT 1 FROM tbl_referral_income WHERE tri_id = p_income_id),
    COALESCE((SELECT tri_payment_status = 'completed' FROM tbl_referral_income WHERE tri_id = p_income_id), false)
  INTO v_income_exists, v_already_paid;
  
  IF NOT v_income_exists THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Referral income record not found'
    );
  END IF;
  
  IF v_already_paid THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Referral income already paid'
    );
  END IF;
  
  -- Mark as paid
  UPDATE tbl_referral_income
  SET 
    tri_payment_status = 'completed',
    tri_paid_at = now(),
    tri_transaction_hash = p_transaction_hash
  WHERE tri_id = p_income_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Referral income marked as paid'
  );
END;
$$;

-- Function to get pending referral incomes for admin payment processing
CREATE OR REPLACE FUNCTION get_pending_referral_incomes()
RETURNS TABLE (
  income_id uuid,
  referrer_id uuid,
  referrer_email text,
  referrer_name text,
  referred_user_id uuid,
  referred_email text,
  referred_name text,
  amount numeric,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    tri.tri_id,
    tri.tri_referrer_id,
    u_referrer.tu_email,
    COALESCE(CONCAT(up_referrer.tup_first_name, ' ', up_referrer.tup_last_name), 'N/A') as referrer_name,
    tri.tri_referred_user_id,
    u_referred.tu_email,
    COALESCE(CONCAT(up_referred.tup_first_name, ' ', up_referred.tup_last_name), 'N/A') as referred_name,
    tri.tri_amount,
    tri.tri_created_at
  FROM tbl_referral_income tri
  JOIN tbl_users u_referrer ON tri.tri_referrer_id = u_referrer.tu_id
  LEFT JOIN tbl_user_profiles up_referrer ON u_referrer.tu_id = up_referrer.tup_user_id
  JOIN tbl_users u_referred ON tri.tri_referred_user_id = u_referred.tu_id
  LEFT JOIN tbl_user_profiles up_referred ON u_referred.tu_id = up_referred.tup_user_id
  WHERE tri.tri_payment_status = 'pending'
  ORDER BY tri.tri_created_at ASC;
END;
$$;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_referral_income_referrer ON tbl_referral_income(tri_referrer_id);
CREATE INDEX IF NOT EXISTS idx_referral_income_status ON tbl_referral_income(tri_payment_status);
CREATE INDEX IF NOT EXISTS idx_users_registration_paid ON tbl_users(tu_registration_paid);
CREATE INDEX IF NOT EXISTS idx_users_referrer_id ON tbl_users(tu_referrer_id);

-- Add comments
COMMENT ON TABLE tbl_referral_income IS 'Tracks $2 referral income earned when users register';
COMMENT ON COLUMN tbl_referral_income.tri_amount IS 'Amount earned (default $2 per registration)';
COMMENT ON COLUMN tbl_users.tu_registration_paid IS 'Whether user paid $5 registration fee';
COMMENT ON COLUMN tbl_users.tu_referrer_id IS 'User who referred this user (receives $2)';
COMMENT ON FUNCTION process_registration_payment IS 'Processes $5 user registration payment and creates $2 referral income record';
COMMENT ON FUNCTION mark_referral_income_paid IS 'Marks referral income as paid with transaction hash';
COMMENT ON FUNCTION get_pending_referral_incomes IS 'Gets all pending $2 referral incomes for admin payment processing';
