/*
  # Wallet System and Task Management

  1. New Tables
    - Enhanced wallet system for all user types
    - Daily task management with automated expiration
    - Coupon sharing and social media tasks
    - Transaction tracking with blockchain integration

  2. Security
    - Enable RLS on all new tables
    - Add policies for user access control
    - Secure wallet operations

  3. Functions
    - Automated task expiration at midnight
    - Wallet balance management
    - Task completion and reward distribution
*/

-- Create wallet functions for balance management
CREATE OR REPLACE FUNCTION update_wallet_balance(
  p_user_id UUID,
  p_amount DECIMAL(18,8),
  p_transaction_type TEXT,
  p_description TEXT,
  p_reference_type TEXT DEFAULT NULL,
  p_reference_id UUID DEFAULT NULL,
  p_blockchain_hash TEXT DEFAULT NULL
) RETURNS JSON AS $$
DECLARE
  v_wallet_id UUID;
  v_current_balance DECIMAL(18,8);
  v_new_balance DECIMAL(18,8);
  v_transaction_id UUID;
BEGIN
  -- Get or create wallet
  SELECT tw_id, tw_balance INTO v_wallet_id, v_current_balance
  FROM tbl_wallets 
  WHERE tw_user_id = p_user_id AND tw_currency = 'USDT';
  
  IF v_wallet_id IS NULL THEN
    INSERT INTO tbl_wallets (tw_user_id, tw_balance, tw_currency)
    VALUES (p_user_id, 0, 'USDT')
    RETURNING tw_id, tw_balance INTO v_wallet_id, v_current_balance;
  END IF;
  
  -- Calculate new balance
  IF p_transaction_type = 'credit' THEN
    v_new_balance := v_current_balance + p_amount;
  ELSIF p_transaction_type = 'debit' THEN
    IF v_current_balance < p_amount THEN
      RAISE EXCEPTION 'Insufficient balance. Current: %, Required: %', v_current_balance, p_amount;
    END IF;
    v_new_balance := v_current_balance - p_amount;
  ELSE
    RAISE EXCEPTION 'Invalid transaction type: %', p_transaction_type;
  END IF;
  
  -- Update wallet balance
  UPDATE tbl_wallets 
  SET tw_balance = v_new_balance, tw_updated_at = NOW()
  WHERE tw_id = v_wallet_id;
  
  -- Create transaction record
  INSERT INTO tbl_wallet_transactions (
    twt_wallet_id,
    twt_user_id,
    twt_transaction_type,
    twt_amount,
    twt_currency,
    twt_description,
    twt_reference_type,
    twt_reference_id,
    twt_blockchain_hash,
    twt_status
  ) VALUES (
    v_wallet_id,
    p_user_id,
    p_transaction_type,
    p_amount,
    'USDT',
    p_description,
    p_reference_type,
    p_reference_id,
    p_blockchain_hash,
    'completed'
  ) RETURNING twt_id INTO v_transaction_id;
  
  RETURN json_build_object(
    'success', true,
    'wallet_id', v_wallet_id,
    'transaction_id', v_transaction_id,
    'old_balance', v_current_balance,
    'new_balance', v_new_balance,
    'amount', p_amount,
    'type', p_transaction_type
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to complete user tasks and distribute rewards
CREATE OR REPLACE FUNCTION complete_user_task(
  p_user_id UUID,
  p_task_id UUID,
  p_share_url TEXT,
  p_platform TEXT,
  p_screenshot_url TEXT DEFAULT NULL
) RETURNS JSON AS $$
DECLARE
  v_task_record RECORD;
  v_existing_task UUID;
  v_reward_amount DECIMAL(10,2);
  v_user_task_id UUID;
BEGIN
  -- Check if task exists and is active
  SELECT * INTO v_task_record
  FROM tbl_daily_tasks
  WHERE tdt_id = p_task_id 
    AND tdt_is_active = true 
    AND tdt_expires_at > NOW()
    AND tdt_completed_count < tdt_max_completions;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task not found, expired, or completed';
  END IF;
  
  -- Check if user already completed this task
  SELECT tut_id INTO v_existing_task
  FROM tbl_user_tasks
  WHERE tut_user_id = p_user_id 
    AND tut_task_id = p_task_id
    AND tut_completion_status IN ('completed', 'verified');
  
  IF FOUND THEN
    RAISE EXCEPTION 'Task already completed by user';
  END IF;
  
  v_reward_amount := v_task_record.tdt_reward_amount;
  
  -- Create or update user task record
  INSERT INTO tbl_user_tasks (
    tut_user_id,
    tut_task_id,
    tut_completion_status,
    tut_share_url,
    tut_share_platform,
    tut_share_screenshot_url,
    tut_reward_amount,
    tut_completed_at
  ) VALUES (
    p_user_id,
    p_task_id,
    'completed',
    p_share_url,
    p_platform,
    p_screenshot_url,
    v_reward_amount,
    NOW()
  ) 
  ON CONFLICT (tut_user_id, tut_task_id) 
  DO UPDATE SET
    tut_completion_status = 'completed',
    tut_share_url = p_share_url,
    tut_share_platform = p_platform,
    tut_share_screenshot_url = p_screenshot_url,
    tut_completed_at = NOW()
  RETURNING tut_id INTO v_user_task_id;
  
  -- Update task completion count
  UPDATE tbl_daily_tasks
  SET tdt_completed_count = tdt_completed_count + 1
  WHERE tdt_id = p_task_id;
  
  -- Credit user wallet
  PERFORM update_wallet_balance(
    p_user_id,
    v_reward_amount,
    'credit',
    'Task completion reward: ' || v_task_record.tdt_title,
    'task_reward',
    p_task_id
  );
  
  -- If it's a coupon share task, also update coupon usage
  IF v_task_record.tdt_task_type = 'coupon_share' AND v_task_record.tdt_coupon_id IS NOT NULL THEN
    UPDATE tbl_coupons
    SET tc_used_count = tc_used_count + 1
    WHERE tc_id = v_task_record.tdt_coupon_id;
    
    -- Create coupon share record
    INSERT INTO tbl_coupon_shares (
      tcs_user_id,
      tcs_coupon_id,
      tcs_platform,
      tcs_share_url,
      tcs_reward_amount,
      tcs_status
    ) VALUES (
      p_user_id,
      v_task_record.tdt_coupon_id,
      p_platform,
      p_share_url,
      v_reward_amount,
      'verified'
    );
  END IF;
  
  -- Create social share record
  INSERT INTO tbl_social_shares (
    tss_user_id,
    tss_task_id,
    tss_coupon_id,
    tss_platform,
    tss_share_url,
    tss_content_type,
    tss_screenshot_url,
    tss_reward_amount,
    tss_status
  ) VALUES (
    p_user_id,
    p_task_id,
    v_task_record.tdt_coupon_id,
    p_platform,
    p_share_url,
    CASE 
      WHEN v_task_record.tdt_task_type = 'coupon_share' THEN 'coupon'
      WHEN v_task_record.tdt_task_type = 'video_share' THEN 'video'
      ELSE 'post'
    END,
    p_screenshot_url,
    v_reward_amount,
    'verified'
  );
  
  RETURN json_build_object(
    'success', true,
    'user_task_id', v_user_task_id,
    'reward_amount', v_reward_amount,
    'task_title', v_task_record.tdt_title,
    'message', 'Task completed successfully'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to expire tasks at midnight
CREATE OR REPLACE FUNCTION expire_daily_tasks() RETURNS void AS $$
BEGIN
  -- Mark expired user tasks
  UPDATE tbl_user_tasks
  SET tut_completion_status = 'expired'
  WHERE tut_completion_status = 'assigned'
    AND EXISTS (
      SELECT 1 FROM tbl_daily_tasks
      WHERE tdt_id = tbl_user_tasks.tut_task_id
        AND tdt_expires_at < NOW()
    );
  
  -- Deactivate expired daily tasks
  UPDATE tbl_daily_tasks
  SET tdt_is_active = false
  WHERE tdt_expires_at < NOW()
    AND tdt_is_active = true;
    
  -- Mark expired coupons
  UPDATE tbl_coupons
  SET tc_status = 'expired',
      tc_is_active = false
  WHERE tc_valid_until < NOW()
    AND tc_status = 'approved'
    AND tc_is_active = true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get user's available daily tasks
CREATE OR REPLACE FUNCTION get_user_daily_tasks(p_user_id UUID)
RETURNS TABLE (
  task_id UUID,
  task_type TEXT,
  task_title TEXT,
  task_description TEXT,
  content_url TEXT,
  reward_amount DECIMAL(10,2),
  expires_at TIMESTAMPTZ,
  completion_status TEXT,
  completed_at TIMESTAMPTZ,
  coupon_info JSON
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    dt.tdt_id,
    dt.tdt_task_type,
    dt.tdt_title,
    dt.tdt_description,
    dt.tdt_content_url,
    dt.tdt_reward_amount,
    dt.tdt_expires_at,
    COALESCE(ut.tut_completion_status, 'assigned'),
    ut.tut_completed_at,
    CASE 
      WHEN dt.tdt_coupon_id IS NOT NULL THEN
        json_build_object(
          'title', c.tc_title,
          'coupon_code', c.tc_coupon_code,
          'image_url', c.tc_image_url,
          'discount_type', c.tc_discount_type,
          'discount_value', c.tc_discount_value
        )
      ELSE NULL
    END
  FROM tbl_daily_tasks dt
  LEFT JOIN tbl_user_tasks ut ON ut.tut_task_id = dt.tdt_id AND ut.tut_user_id = p_user_id
  LEFT JOIN tbl_coupons c ON c.tc_id = dt.tdt_coupon_id
  WHERE dt.tdt_task_date = CURRENT_DATE
    AND dt.tdt_is_active = true
    AND dt.tdt_expires_at > NOW()
    AND dt.tdt_completed_count < dt.tdt_max_completions
  ORDER BY dt.tdt_created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get wallet summary
CREATE OR REPLACE FUNCTION get_wallet_summary(p_user_id UUID)
RETURNS JSON AS $$
DECLARE
  v_wallet_balance DECIMAL(18,8);
  v_total_earned DECIMAL(18,8);
  v_total_spent DECIMAL(18,8);
  v_pending_rewards DECIMAL(18,8);
  v_tasks_completed INTEGER;
  v_coupons_shared INTEGER;
BEGIN
  -- Get current wallet balance
  SELECT COALESCE(tw_balance, 0) INTO v_wallet_balance
  FROM tbl_wallets
  WHERE tw_user_id = p_user_id AND tw_currency = 'USDT';
  
  -- Get total earned (credits)
  SELECT COALESCE(SUM(twt_amount), 0) INTO v_total_earned
  FROM tbl_wallet_transactions
  WHERE twt_user_id = p_user_id 
    AND twt_transaction_type = 'credit'
    AND twt_status = 'completed';
  
  -- Get total spent (debits)
  SELECT COALESCE(SUM(twt_amount), 0) INTO v_total_spent
  FROM tbl_wallet_transactions
  WHERE twt_user_id = p_user_id 
    AND twt_transaction_type = 'debit'
    AND twt_status = 'completed';
  
  -- Get pending rewards
  SELECT COALESCE(SUM(tut_reward_amount), 0) INTO v_pending_rewards
  FROM tbl_user_tasks
  WHERE tut_user_id = p_user_id 
    AND tut_completion_status = 'completed'
    AND tut_reward_paid = false;
  
  -- Get tasks completed count
  SELECT COUNT(*) INTO v_tasks_completed
  FROM tbl_user_tasks
  WHERE tut_user_id = p_user_id 
    AND tut_completion_status IN ('completed', 'verified');
  
  -- Get coupons shared count
  SELECT COUNT(*) INTO v_coupons_shared
  FROM tbl_coupon_shares
  WHERE tcs_user_id = p_user_id;
  
  RETURN json_build_object(
    'wallet_balance', COALESCE(v_wallet_balance, 0),
    'total_earned', COALESCE(v_total_earned, 0),
    'total_spent', COALESCE(v_total_spent, 0),
    'pending_rewards', COALESCE(v_pending_rewards, 0),
    'tasks_completed', v_tasks_completed,
    'coupons_shared', v_coupons_shared
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to automatically assign daily tasks to all active users
CREATE OR REPLACE FUNCTION assign_daily_tasks_to_users() RETURNS void AS $$
DECLARE
  v_task RECORD;
  v_user RECORD;
BEGIN
  -- Get today's active tasks
  FOR v_task IN 
    SELECT tdt_id, tdt_max_completions, tdt_completed_count
    FROM tbl_daily_tasks
    WHERE tdt_task_date = CURRENT_DATE
      AND tdt_is_active = true
      AND tdt_expires_at > NOW()
      AND tdt_completed_count < tdt_max_completions
  LOOP
    -- Assign to all active verified users who haven't been assigned yet
    FOR v_user IN
      SELECT tu_id
      FROM tbl_users
      WHERE tu_user_type = 'customer'
        AND tu_is_active = true
        AND tu_is_verified = true
        AND NOT EXISTS (
          SELECT 1 FROM tbl_user_tasks
          WHERE tut_user_id = tu_id AND tut_task_id = v_task.tdt_id
        )
    LOOP
      INSERT INTO tbl_user_tasks (
        tut_user_id,
        tut_task_id,
        tut_completion_status,
        tut_reward_amount
      ) VALUES (
        v_user.tu_id,
        v_task.tdt_id,
        'assigned',
        (SELECT tdt_reward_amount FROM tbl_daily_tasks WHERE tdt_id = v_task.tdt_id)
      );
    END LOOP;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to automatically create wallet for new users
CREATE OR REPLACE FUNCTION create_user_wallet()
RETURNS TRIGGER AS $$
BEGIN
  -- Create USDT wallet for new user
  INSERT INTO tbl_wallets (tw_user_id, tw_balance, tw_currency)
  VALUES (NEW.tu_id, 0.00000000, 'USDT');
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply the trigger if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'trigger_create_user_wallet'
  ) THEN
    CREATE TRIGGER trigger_create_user_wallet
      AFTER INSERT ON tbl_users
      FOR EACH ROW
      EXECUTE FUNCTION create_user_wallet();
  END IF;
END $$;

-- Enable RLS on wallet tables
ALTER TABLE tbl_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE tbl_wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tbl_coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE tbl_daily_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE tbl_user_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE tbl_social_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE tbl_coupon_shares ENABLE ROW LEVEL SECURITY;

-- Wallet policies
CREATE POLICY "Users can read own wallet"
  ON tbl_wallets FOR SELECT
  TO authenticated
  USING (tw_user_id = uid());

CREATE POLICY "System can insert wallets"
  ON tbl_wallets FOR INSERT
  TO authenticated
  WITH CHECK (tw_user_id = uid());

CREATE POLICY "Users can update own wallet"
  ON tbl_wallets FOR UPDATE
  TO authenticated
  USING (tw_user_id = uid());

-- Wallet transaction policies
CREATE POLICY "Users can read own transactions"
  ON tbl_wallet_transactions FOR SELECT
  TO authenticated
  USING (twt_user_id = uid());

CREATE POLICY "System can insert transactions"
  ON tbl_wallet_transactions FOR INSERT
  TO authenticated
  WITH CHECK (twt_user_id = uid());

-- Coupon policies
CREATE POLICY "Everyone can read approved coupons"
  ON tbl_coupons FOR SELECT
  TO authenticated
  USING (tc_status = 'approved' AND tc_is_active = true);

CREATE POLICY "Companies can manage own coupons"
  ON tbl_coupons FOR ALL
  TO authenticated
  USING (tc_created_by = uid());

CREATE POLICY "Admins can manage all coupons"
  ON tbl_coupons FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tbl_users
      WHERE tu_id = uid() AND tu_user_type = 'admin'
    )
  );

-- Daily task policies
CREATE POLICY "Users can read active tasks"
  ON tbl_daily_tasks FOR SELECT
  TO authenticated
  USING (tdt_is_active = true AND tdt_expires_at > NOW());

CREATE POLICY "Admins can manage tasks"
  ON tbl_daily_tasks FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tbl_users
      WHERE tu_id = uid() AND tu_user_type = 'admin'
    )
  );

-- User task policies
CREATE POLICY "Users can manage own tasks"
  ON tbl_user_tasks FOR ALL
  TO authenticated
  USING (tut_user_id = uid());

CREATE POLICY "Admins can verify all tasks"
  ON tbl_user_tasks FOR ALL
  TO authenticated
  USING (
    tut_user_id = uid() OR 
    EXISTS (
      SELECT 1 FROM tbl_users
      WHERE tu_id = uid() AND tu_user_type = 'admin'
    )
  );

-- Social share policies
CREATE POLICY "Users can manage own shares"
  ON tbl_social_shares FOR ALL
  TO authenticated
  USING (tss_user_id = uid());

CREATE POLICY "Admins can verify shares"
  ON tbl_social_shares FOR ALL
  TO authenticated
  USING (
    tss_user_id = uid() OR 
    EXISTS (
      SELECT 1 FROM tbl_users
      WHERE tu_id = uid() AND tu_user_type = 'admin'
    )
  );

-- Coupon share policies
CREATE POLICY "Users can manage own coupon shares"
  ON tbl_coupon_shares FOR ALL
  TO authenticated
  USING (tcs_user_id = uid());

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_tbl_wallets_user_currency ON tbl_wallets(tw_user_id, tw_currency);
CREATE INDEX IF NOT EXISTS idx_tbl_wallet_transactions_user_date ON tbl_wallet_transactions(twt_user_id, twt_created_at);
CREATE INDEX IF NOT EXISTS idx_tbl_daily_tasks_date_active ON tbl_daily_tasks(tdt_task_date, tdt_is_active);
CREATE INDEX IF NOT EXISTS idx_tbl_user_tasks_user_status ON tbl_user_tasks(tut_user_id, tut_completion_status);
CREATE INDEX IF NOT EXISTS idx_tbl_coupons_status_active ON tbl_coupons(tc_status, tc_is_active);

-- Insert sample daily tasks for testing
INSERT INTO tbl_daily_tasks (
  tdt_created_by,
  tdt_task_type,
  tdt_title,
  tdt_description,
  tdt_reward_amount,
  tdt_max_completions,
  tdt_target_platforms,
  tdt_task_date,
  tdt_expires_at,
  tdt_is_active
) VALUES 
(
  (SELECT tu_id FROM tbl_users WHERE tu_user_type = 'admin' LIMIT 1),
  'social_share',
  'Share Our Latest Post',
  'Share our latest social media post on your preferred platform',
  0.25,
  1000,
  ARRAY['facebook', 'instagram', 'twitter', 'linkedin'],
  CURRENT_DATE,
  CURRENT_DATE + INTERVAL '1 day' - INTERVAL '1 second',
  true
),
(
  (SELECT tu_id FROM tbl_users WHERE tu_user_type = 'admin' LIMIT 1),
  'video_share',
  'Share Product Demo Video',
  'Share our product demonstration video to help others learn about our platform',
  0.50,
  500,
  ARRAY['youtube', 'facebook', 'instagram', 'tiktok'],
  CURRENT_DATE,
  CURRENT_DATE + INTERVAL '1 day' - INTERVAL '1 second',
  true
) ON CONFLICT DO NOTHING;

-- Create a scheduled job to expire tasks at midnight (this would be set up in production)
-- For now, we'll create a function that can be called manually or via cron
COMMENT ON FUNCTION expire_daily_tasks() IS 'Run this function daily at midnight to expire tasks';
COMMENT ON FUNCTION assign_daily_tasks_to_users() IS 'Run this function when new daily tasks are created';