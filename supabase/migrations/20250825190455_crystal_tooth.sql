/*
  # Wallet System with Coupon Management and Daily Tasks

  1. New Tables
    - `tbl_wallets` - Individual wallets for each user (customer, admin, company)
    - `tbl_wallet_transactions` - All wallet transaction history
    - `tbl_coupons` - Coupon management system
    - `tbl_daily_tasks` - Daily tasks assigned by admin
    - `tbl_user_tasks` - User task completion tracking
    - `tbl_social_shares` - Track social media shares
    - `tbl_coupon_shares` - Track coupon sharing activities

  2. Security
    - Enable RLS on all new tables
    - Add policies for user access control
    - Secure wallet operations

  3. Features
    - Multi-user wallet system
    - Coupon creation and management
    - Daily task assignment
    - Social media sharing tracking
    - Automated USDT rewards
    - Task expiration at midnight
*/

-- Create wallet system
CREATE TABLE IF NOT EXISTS tbl_wallets (
  tw_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tw_user_id uuid NOT NULL REFERENCES tbl_users(tu_id) ON DELETE CASCADE,
  tw_balance numeric(18,8) DEFAULT 0.00000000,
  tw_currency text DEFAULT 'USDT',
  tw_wallet_address text,
  tw_private_key_encrypted text,
  tw_is_active boolean DEFAULT true,
  tw_created_at timestamptz DEFAULT now(),
  tw_updated_at timestamptz DEFAULT now(),
  UNIQUE(tw_user_id, tw_currency)
);

-- Create wallet transactions
CREATE TABLE IF NOT EXISTS tbl_wallet_transactions (
  twt_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  twt_wallet_id uuid NOT NULL REFERENCES tbl_wallets(tw_id) ON DELETE CASCADE,
  twt_user_id uuid NOT NULL REFERENCES tbl_users(tu_id) ON DELETE CASCADE,
  twt_transaction_type text NOT NULL CHECK (twt_transaction_type IN ('credit', 'debit', 'transfer')),
  twt_amount numeric(18,8) NOT NULL,
  twt_currency text DEFAULT 'USDT',
  twt_description text NOT NULL,
  twt_reference_type text CHECK (twt_reference_type IN ('task_reward', 'coupon_share', 'social_share', 'admin_credit', 'withdrawal', 'deposit', 'transfer')),
  twt_reference_id uuid,
  twt_blockchain_hash text,
  twt_status text DEFAULT 'completed' CHECK (twt_status IN ('pending', 'completed', 'failed', 'cancelled')),
  twt_created_at timestamptz DEFAULT now()
);

-- Create coupons table
CREATE TABLE IF NOT EXISTS tbl_coupons (
  tc_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tc_created_by uuid NOT NULL REFERENCES tbl_users(tu_id) ON DELETE CASCADE,
  tc_company_id uuid REFERENCES tbl_companies(tc_id) ON DELETE SET NULL,
  tc_title text NOT NULL,
  tc_description text,
  tc_coupon_code text UNIQUE NOT NULL,
  tc_discount_type text CHECK (tc_discount_type IN ('percentage', 'fixed_amount')),
  tc_discount_value numeric(10,2),
  tc_image_url text,
  tc_terms_conditions text,
  tc_valid_from timestamptz DEFAULT now(),
  tc_valid_until timestamptz,
  tc_usage_limit integer DEFAULT 1000,
  tc_used_count integer DEFAULT 0,
  tc_share_reward_amount numeric(10,2) DEFAULT 0.50,
  tc_status text DEFAULT 'pending' CHECK (tc_status IN ('pending', 'approved', 'declined', 'cancelled', 'expired')),
  tc_is_active boolean DEFAULT true,
  tc_created_at timestamptz DEFAULT now(),
  tc_updated_at timestamptz DEFAULT now()
);

-- Create daily tasks table
CREATE TABLE IF NOT EXISTS tbl_daily_tasks (
  tdt_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tdt_created_by uuid NOT NULL REFERENCES tbl_users(tu_id) ON DELETE CASCADE,
  tdt_task_type text NOT NULL CHECK (tdt_task_type IN ('coupon_share', 'social_share', 'video_share', 'custom')),
  tdt_title text NOT NULL,
  tdt_description text,
  tdt_content_url text,
  tdt_coupon_id uuid REFERENCES tbl_coupons(tc_id) ON DELETE SET NULL,
  tdt_reward_amount numeric(10,2) NOT NULL,
  tdt_max_completions integer DEFAULT 1000,
  tdt_completed_count integer DEFAULT 0,
  tdt_target_platforms text[] DEFAULT ARRAY['facebook', 'instagram', 'twitter', 'youtube'],
  tdt_task_date date DEFAULT CURRENT_DATE,
  tdt_expires_at timestamptz DEFAULT (CURRENT_DATE + INTERVAL '1 day'),
  tdt_is_active boolean DEFAULT true,
  tdt_created_at timestamptz DEFAULT now(),
  tdt_updated_at timestamptz DEFAULT now()
);

-- Create user tasks tracking
CREATE TABLE IF NOT EXISTS tbl_user_tasks (
  tut_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tut_user_id uuid NOT NULL REFERENCES tbl_users(tu_id) ON DELETE CASCADE,
  tut_task_id uuid NOT NULL REFERENCES tbl_daily_tasks(tdt_id) ON DELETE CASCADE,
  tut_completion_status text DEFAULT 'assigned' CHECK (tut_completion_status IN ('assigned', 'in_progress', 'completed', 'verified', 'expired', 'failed')),
  tut_share_url text,
  tut_share_platform text,
  tut_share_screenshot_url text,
  tut_reward_amount numeric(10,2),
  tut_reward_paid boolean DEFAULT false,
  tut_completed_at timestamptz,
  tut_verified_at timestamptz,
  tut_verified_by uuid REFERENCES tbl_users(tu_id),
  tut_notes text,
  tut_created_at timestamptz DEFAULT now(),
  tut_updated_at timestamptz DEFAULT now(),
  UNIQUE(tut_user_id, tut_task_id)
);

-- Create social shares tracking
CREATE TABLE IF NOT EXISTS tbl_social_shares (
  tss_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tss_user_id uuid NOT NULL REFERENCES tbl_users(tu_id) ON DELETE CASCADE,
  tss_task_id uuid REFERENCES tbl_daily_tasks(tdt_id) ON DELETE SET NULL,
  tss_coupon_id uuid REFERENCES tbl_coupons(tc_id) ON DELETE SET NULL,
  tss_platform text NOT NULL CHECK (tss_platform IN ('facebook', 'instagram', 'twitter', 'youtube', 'linkedin', 'tiktok')),
  tss_share_url text NOT NULL,
  tss_content_type text CHECK (tss_content_type IN ('coupon', 'video', 'post', 'story')),
  tss_screenshot_url text,
  tss_reward_amount numeric(10,2) DEFAULT 0,
  tss_status text DEFAULT 'pending' CHECK (tss_status IN ('pending', 'verified', 'rejected')),
  tss_verified_by uuid REFERENCES tbl_users(tu_id),
  tss_verified_at timestamptz,
  tss_created_at timestamptz DEFAULT now()
);

-- Create coupon shares tracking
CREATE TABLE IF NOT EXISTS tbl_coupon_shares (
  tcs_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tcs_user_id uuid NOT NULL REFERENCES tbl_users(tu_id) ON DELETE CASCADE,
  tcs_coupon_id uuid NOT NULL REFERENCES tbl_coupons(tc_id) ON DELETE CASCADE,
  tcs_platform text NOT NULL,
  tcs_share_url text NOT NULL,
  tcs_reward_amount numeric(10,2) DEFAULT 0,
  tcs_status text DEFAULT 'pending' CHECK (tcs_status IN ('pending', 'verified', 'paid')),
  tcs_created_at timestamptz DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE tbl_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE tbl_wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tbl_coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE tbl_daily_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE tbl_user_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE tbl_social_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE tbl_coupon_shares ENABLE ROW LEVEL SECURITY;

-- Wallet policies
CREATE POLICY "Users can read own wallet"
  ON tbl_wallets
  FOR SELECT
  TO authenticated
  USING (tw_user_id = auth.uid());

CREATE POLICY "Users can update own wallet"
  ON tbl_wallets
  FOR UPDATE
  TO authenticated
  USING (tw_user_id = auth.uid());

CREATE POLICY "System can insert wallets"
  ON tbl_wallets
  FOR INSERT
  TO authenticated
  WITH CHECK (tw_user_id = auth.uid());

-- Wallet transaction policies
CREATE POLICY "Users can read own transactions"
  ON tbl_wallet_transactions
  FOR SELECT
  TO authenticated
  USING (twt_user_id = auth.uid());

CREATE POLICY "System can insert transactions"
  ON tbl_wallet_transactions
  FOR INSERT
  TO authenticated
  WITH CHECK (twt_user_id = auth.uid());

-- Coupon policies
CREATE POLICY "Everyone can read approved coupons"
  ON tbl_coupons
  FOR SELECT
  TO authenticated
  USING (tc_status = 'approved' AND tc_is_active = true);

CREATE POLICY "Companies can manage own coupons"
  ON tbl_coupons
  FOR ALL
  TO authenticated
  USING (tc_created_by = auth.uid());

CREATE POLICY "Admins can manage all coupons"
  ON tbl_coupons
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tbl_users 
      WHERE tu_id = auth.uid() AND tu_user_type = 'admin'
    )
  );

-- Daily task policies
CREATE POLICY "Users can read active tasks"
  ON tbl_daily_tasks
  FOR SELECT
  TO authenticated
  USING (tdt_is_active = true AND tdt_expires_at > now());

CREATE POLICY "Admins can manage tasks"
  ON tbl_daily_tasks
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tbl_users 
      WHERE tu_id = auth.uid() AND tu_user_type = 'admin'
    )
  );

-- User task policies
CREATE POLICY "Users can manage own tasks"
  ON tbl_user_tasks
  FOR ALL
  TO authenticated
  USING (tut_user_id = auth.uid());

CREATE POLICY "Admins can verify all tasks"
  ON tbl_user_tasks
  FOR ALL
  TO authenticated
  USING (
    tut_user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM tbl_users 
      WHERE tu_id = auth.uid() AND tu_user_type = 'admin'
    )
  );

-- Social share policies
CREATE POLICY "Users can manage own shares"
  ON tbl_social_shares
  FOR ALL
  TO authenticated
  USING (tss_user_id = auth.uid());

CREATE POLICY "Admins can verify shares"
  ON tbl_social_shares
  FOR ALL
  TO authenticated
  USING (
    tss_user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM tbl_users 
      WHERE tu_id = auth.uid() AND tu_user_type = 'admin'
    )
  );

-- Coupon share policies
CREATE POLICY "Users can manage own coupon shares"
  ON tbl_coupon_shares
  FOR ALL
  TO authenticated
  USING (tcs_user_id = auth.uid());

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_tbl_wallets_user_id ON tbl_wallets(tw_user_id);
CREATE INDEX IF NOT EXISTS idx_tbl_wallets_currency ON tbl_wallets(tw_currency);
CREATE INDEX IF NOT EXISTS idx_tbl_wallet_transactions_user_id ON tbl_wallet_transactions(twt_user_id);
CREATE INDEX IF NOT EXISTS idx_tbl_wallet_transactions_wallet_id ON tbl_wallet_transactions(twt_wallet_id);
CREATE INDEX IF NOT EXISTS idx_tbl_wallet_transactions_type ON tbl_wallet_transactions(twt_transaction_type);
CREATE INDEX IF NOT EXISTS idx_tbl_wallet_transactions_status ON tbl_wallet_transactions(twt_status);
CREATE INDEX IF NOT EXISTS idx_tbl_coupons_status ON tbl_coupons(tc_status);
CREATE INDEX IF NOT EXISTS idx_tbl_coupons_company_id ON tbl_coupons(tc_company_id);
CREATE INDEX IF NOT EXISTS idx_tbl_coupons_created_by ON tbl_coupons(tc_created_by);
CREATE INDEX IF NOT EXISTS idx_tbl_daily_tasks_date ON tbl_daily_tasks(tdt_task_date);
CREATE INDEX IF NOT EXISTS idx_tbl_daily_tasks_expires ON tbl_daily_tasks(tdt_expires_at);
CREATE INDEX IF NOT EXISTS idx_tbl_user_tasks_user_id ON tbl_user_tasks(tut_user_id);
CREATE INDEX IF NOT EXISTS idx_tbl_user_tasks_task_id ON tbl_user_tasks(tut_task_id);
CREATE INDEX IF NOT EXISTS idx_tbl_user_tasks_status ON tbl_user_tasks(tut_completion_status);
CREATE INDEX IF NOT EXISTS idx_tbl_social_shares_user_id ON tbl_social_shares(tss_user_id);
CREATE INDEX IF NOT EXISTS idx_tbl_social_shares_platform ON tbl_social_shares(tss_platform);
CREATE INDEX IF NOT EXISTS idx_tbl_coupon_shares_user_id ON tbl_coupon_shares(tcs_user_id);
CREATE INDEX IF NOT EXISTS idx_tbl_coupon_shares_coupon_id ON tbl_coupon_shares(tcs_coupon_id);

-- Create function to automatically create wallet for new users
CREATE OR REPLACE FUNCTION create_user_wallet()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO tbl_wallets (tw_user_id, tw_balance, tw_currency)
  VALUES (NEW.tu_id, 0.00000000, 'USDT');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-create wallet
DROP TRIGGER IF EXISTS trigger_create_user_wallet ON tbl_users;
CREATE TRIGGER trigger_create_user_wallet
  AFTER INSERT ON tbl_users
  FOR EACH ROW
  EXECUTE FUNCTION create_user_wallet();

-- Create function to update wallet balance
CREATE OR REPLACE FUNCTION update_wallet_balance(
  p_user_id uuid,
  p_amount numeric(18,8),
  p_transaction_type text,
  p_description text,
  p_reference_type text DEFAULT NULL,
  p_reference_id uuid DEFAULT NULL
)
RETURNS json AS $$
DECLARE
  v_wallet_id uuid;
  v_current_balance numeric(18,8);
  v_new_balance numeric(18,8);
  v_transaction_id uuid;
BEGIN
  -- Get user's wallet
  SELECT tw_id, tw_balance INTO v_wallet_id, v_current_balance
  FROM tbl_wallets
  WHERE tw_user_id = p_user_id AND tw_currency = 'USDT';

  IF v_wallet_id IS NULL THEN
    RAISE EXCEPTION 'Wallet not found for user';
  END IF;

  -- Calculate new balance
  IF p_transaction_type = 'credit' THEN
    v_new_balance := v_current_balance + p_amount;
  ELSIF p_transaction_type = 'debit' THEN
    IF v_current_balance < p_amount THEN
      RAISE EXCEPTION 'Insufficient balance';
    END IF;
    v_new_balance := v_current_balance - p_amount;
  ELSE
    RAISE EXCEPTION 'Invalid transaction type';
  END IF;

  -- Update wallet balance
  UPDATE tbl_wallets
  SET tw_balance = v_new_balance, tw_updated_at = now()
  WHERE tw_id = v_wallet_id;

  -- Create transaction record
  INSERT INTO tbl_wallet_transactions (
    twt_wallet_id, twt_user_id, twt_transaction_type, twt_amount,
    twt_description, twt_reference_type, twt_reference_id
  ) VALUES (
    v_wallet_id, p_user_id, p_transaction_type, p_amount,
    p_description, p_reference_type, p_reference_id
  ) RETURNING twt_id INTO v_transaction_id;

  RETURN json_build_object(
    'success', true,
    'wallet_id', v_wallet_id,
    'transaction_id', v_transaction_id,
    'old_balance', v_current_balance,
    'new_balance', v_new_balance
  );
END;
$$ LANGUAGE plpgsql;

-- Create function to assign daily tasks to all customers
CREATE OR REPLACE FUNCTION assign_daily_tasks()
RETURNS json AS $$
DECLARE
  v_task record;
  v_customer record;
  v_assigned_count integer := 0;
BEGIN
  -- Get all active tasks for today
  FOR v_task IN 
    SELECT * FROM tbl_daily_tasks 
    WHERE tdt_task_date = CURRENT_DATE 
    AND tdt_is_active = true 
    AND tdt_expires_at > now()
  LOOP
    -- Assign to all active customers who don't already have this task
    FOR v_customer IN 
      SELECT tu_id FROM tbl_users 
      WHERE tu_user_type = 'customer' 
      AND tu_is_active = true
      AND tu_id NOT IN (
        SELECT tut_user_id FROM tbl_user_tasks 
        WHERE tut_task_id = v_task.tdt_id
      )
    LOOP
      INSERT INTO tbl_user_tasks (
        tut_user_id, tut_task_id, tut_reward_amount
      ) VALUES (
        v_customer.tu_id, v_task.tdt_id, v_task.tdt_reward_amount
      );
      v_assigned_count := v_assigned_count + 1;
    END LOOP;
  END LOOP;

  RETURN json_build_object(
    'success', true,
    'assigned_count', v_assigned_count,
    'message', 'Daily tasks assigned successfully'
  );
END;
$$ LANGUAGE plpgsql;

-- Create function to complete task and reward user
CREATE OR REPLACE FUNCTION complete_user_task(
  p_user_id uuid,
  p_task_id uuid,
  p_share_url text,
  p_platform text,
  p_screenshot_url text DEFAULT NULL
)
RETURNS json AS $$
DECLARE
  v_task record;
  v_user_task record;
  v_reward_result json;
BEGIN
  -- Get task details
  SELECT * INTO v_task FROM tbl_daily_tasks WHERE tdt_id = p_task_id;
  
  IF v_task IS NULL THEN
    RAISE EXCEPTION 'Task not found';
  END IF;

  IF v_task.tdt_expires_at <= now() THEN
    RAISE EXCEPTION 'Task has expired';
  END IF;

  -- Get user task
  SELECT * INTO v_user_task FROM tbl_user_tasks 
  WHERE tut_user_id = p_user_id AND tut_task_id = p_task_id;

  IF v_user_task IS NULL THEN
    RAISE EXCEPTION 'Task not assigned to user';
  END IF;

  IF v_user_task.tut_completion_status = 'completed' THEN
    RAISE EXCEPTION 'Task already completed';
  END IF;

  -- Update task completion
  UPDATE tbl_user_tasks
  SET 
    tut_completion_status = 'completed',
    tut_share_url = p_share_url,
    tut_share_platform = p_platform,
    tut_share_screenshot_url = p_screenshot_url,
    tut_completed_at = now(),
    tut_updated_at = now()
  WHERE tut_id = v_user_task.tut_id;

  -- Record social share
  INSERT INTO tbl_social_shares (
    tss_user_id, tss_task_id, tss_coupon_id, tss_platform,
    tss_share_url, tss_content_type, tss_screenshot_url, tss_reward_amount
  ) VALUES (
    p_user_id, p_task_id, v_task.tdt_coupon_id, p_platform,
    p_share_url, v_task.tdt_task_type, p_screenshot_url, v_task.tdt_reward_amount
  );

  -- Credit reward to user's wallet
  SELECT update_wallet_balance(
    p_user_id,
    v_task.tdt_reward_amount,
    'credit',
    'Task completion reward: ' || v_task.tdt_title,
    'task_reward',
    p_task_id
  ) INTO v_reward_result;

  -- Update task completion count
  UPDATE tbl_daily_tasks
  SET tdt_completed_count = tdt_completed_count + 1
  WHERE tdt_id = p_task_id;

  -- Mark reward as paid
  UPDATE tbl_user_tasks
  SET tut_reward_paid = true
  WHERE tut_id = v_user_task.tut_id;

  RETURN json_build_object(
    'success', true,
    'message', 'Task completed and reward credited',
    'reward_amount', v_task.tdt_reward_amount,
    'wallet_update', v_reward_result
  );
END;
$$ LANGUAGE plpgsql;

-- Create function to expire old tasks (run daily at midnight)
CREATE OR REPLACE FUNCTION expire_old_tasks()
RETURNS json AS $$
DECLARE
  v_expired_count integer;
BEGIN
  -- Mark uncompleted tasks as expired
  UPDATE tbl_user_tasks
  SET 
    tut_completion_status = 'expired',
    tut_updated_at = now()
  WHERE tut_completion_status IN ('assigned', 'in_progress')
  AND EXISTS (
    SELECT 1 FROM tbl_daily_tasks 
    WHERE tdt_id = tut_task_id 
    AND tdt_expires_at <= now()
  );

  GET DIAGNOSTICS v_expired_count = ROW_COUNT;

  -- Deactivate expired daily tasks
  UPDATE tbl_daily_tasks
  SET tdt_is_active = false
  WHERE tdt_expires_at <= now() AND tdt_is_active = true;

  RETURN json_build_object(
    'success', true,
    'expired_tasks', v_expired_count,
    'message', 'Old tasks expired successfully'
  );
END;
$$ LANGUAGE plpgsql;

-- Create function to get user's daily tasks
CREATE OR REPLACE FUNCTION get_user_daily_tasks(p_user_id uuid)
RETURNS TABLE (
  task_id uuid,
  task_title text,
  task_description text,
  task_type text,
  content_url text,
  reward_amount numeric(10,2),
  completion_status text,
  expires_at timestamptz,
  coupon_info json,
  completed_at timestamptz
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    dt.tdt_id,
    dt.tdt_title,
    dt.tdt_description,
    dt.tdt_task_type,
    dt.tdt_content_url,
    dt.tdt_reward_amount,
    COALESCE(ut.tut_completion_status, 'assigned'),
    dt.tdt_expires_at,
    CASE 
      WHEN dt.tdt_coupon_id IS NOT NULL THEN
        json_build_object(
          'id', c.tc_id,
          'title', c.tc_title,
          'code', c.tc_coupon_code,
          'image_url', c.tc_image_url
        )
      ELSE NULL
    END,
    ut.tut_completed_at
  FROM tbl_daily_tasks dt
  LEFT JOIN tbl_user_tasks ut ON dt.tdt_id = ut.tut_task_id AND ut.tut_user_id = p_user_id
  LEFT JOIN tbl_coupons c ON dt.tdt_coupon_id = c.tc_id
  WHERE dt.tdt_task_date = CURRENT_DATE
  AND dt.tdt_is_active = true
  AND dt.tdt_expires_at > now()
  ORDER BY dt.tdt_created_at;
END;
$$ LANGUAGE plpgsql;

-- Create function to get wallet summary
CREATE OR REPLACE FUNCTION get_wallet_summary(p_user_id uuid)
RETURNS json AS $$
DECLARE
  v_wallet record;
  v_today_earnings numeric(18,8);
  v_total_earnings numeric(18,8);
  v_pending_tasks integer;
BEGIN
  -- Get wallet info
  SELECT * INTO v_wallet FROM tbl_wallets WHERE tw_user_id = p_user_id AND tw_currency = 'USDT';

  IF v_wallet IS NULL THEN
    RAISE EXCEPTION 'Wallet not found';
  END IF;

  -- Get today's earnings
  SELECT COALESCE(SUM(twt_amount), 0) INTO v_today_earnings
  FROM tbl_wallet_transactions
  WHERE twt_user_id = p_user_id
  AND twt_transaction_type = 'credit'
  AND DATE(twt_created_at) = CURRENT_DATE;

  -- Get total earnings
  SELECT COALESCE(SUM(twt_amount), 0) INTO v_total_earnings
  FROM tbl_wallet_transactions
  WHERE twt_user_id = p_user_id
  AND twt_transaction_type = 'credit';

  -- Get pending tasks count
  SELECT COUNT(*) INTO v_pending_tasks
  FROM tbl_user_tasks ut
  JOIN tbl_daily_tasks dt ON ut.tut_task_id = dt.tdt_id
  WHERE ut.tut_user_id = p_user_id
  AND ut.tut_completion_status = 'assigned'
  AND dt.tdt_expires_at > now();

  RETURN json_build_object(
    'wallet_id', v_wallet.tw_id,
    'balance', v_wallet.tw_balance,
    'currency', v_wallet.tw_currency,
    'today_earnings', v_today_earnings,
    'total_earnings', v_total_earnings,
    'pending_tasks', v_pending_tasks,
    'wallet_address', v_wallet.tw_wallet_address
  );
END;
$$ LANGUAGE plpgsql;

-- Insert sample data
INSERT INTO tbl_coupons (tc_created_by, tc_title, tc_description, tc_coupon_code, tc_discount_type, tc_discount_value, tc_share_reward_amount, tc_status, tc_valid_until) 
SELECT 
  tu_id,
  'Welcome Discount',
  'Get 20% off on your first purchase',
  'WELCOME20',
  'percentage',
  20.00,
  0.50,
  'approved',
  now() + interval '30 days'
FROM tbl_users 
WHERE tu_user_type = 'admin' 
LIMIT 1
ON CONFLICT (tc_coupon_code) DO NOTHING;

INSERT INTO tbl_coupons (tc_created_by, tc_title, tc_description, tc_coupon_code, tc_discount_type, tc_discount_value, tc_share_reward_amount, tc_status, tc_valid_until)
SELECT 
  tu_id,
  'Summer Sale',
  'Special summer discount - 15% off everything',
  'SUMMER15',
  'percentage',
  15.00,
  0.75,
  'approved',
  now() + interval '15 days'
FROM tbl_users 
WHERE tu_user_type = 'admin' 
LIMIT 1
ON CONFLICT (tc_coupon_code) DO NOTHING;

-- Insert sample daily tasks
INSERT INTO tbl_daily_tasks (tdt_created_by, tdt_task_type, tdt_title, tdt_description, tdt_reward_amount, tdt_content_url)
SELECT 
  tu_id,
  'social_share',
  'Share Our Instagram Post',
  'Share our latest Instagram post on your story and tag 3 friends',
  1.00,
  'https://instagram.com/p/sample-post'
FROM tbl_users 
WHERE tu_user_type = 'admin' 
LIMIT 1;

INSERT INTO tbl_daily_tasks (tdt_created_by, tdt_task_type, tdt_title, tdt_description, tdt_reward_amount, tdt_content_url)
SELECT 
  tu_id,
  'video_share',
  'Share YouTube Video',
  'Share our promotional video on Facebook and get rewarded',
  1.50,
  'https://youtube.com/watch?v=sample-video'
FROM tbl_users 
WHERE tu_user_type = 'admin' 
LIMIT 1;

-- Create updated_at triggers for new tables
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.tw_updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_coupons_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.tc_updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_daily_tasks_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.tdt_updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_user_tasks_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.tut_updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers
DROP TRIGGER IF EXISTS trigger_wallets_updated_at ON tbl_wallets;
CREATE TRIGGER trigger_wallets_updated_at
  BEFORE UPDATE ON tbl_wallets
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trigger_coupons_updated_at ON tbl_coupons;
CREATE TRIGGER trigger_coupons_updated_at
  BEFORE UPDATE ON tbl_coupons
  FOR EACH ROW
  EXECUTE FUNCTION update_coupons_updated_at_column();

DROP TRIGGER IF EXISTS trigger_daily_tasks_updated_at ON tbl_daily_tasks;
CREATE TRIGGER trigger_daily_tasks_updated_at
  BEFORE UPDATE ON tbl_daily_tasks
  FOR EACH ROW
  EXECUTE FUNCTION update_daily_tasks_updated_at_column();

DROP TRIGGER IF EXISTS trigger_user_tasks_updated_at ON tbl_user_tasks;
CREATE TRIGGER trigger_user_tasks_updated_at
  BEFORE UPDATE ON tbl_user_tasks
  FOR EACH ROW
  EXECUTE FUNCTION update_user_tasks_updated_at_column();