/*
  # Add Missing Foreign Key Indexes

  1. Performance Improvements
    - Add indexes for all unindexed foreign keys
    - Improves JOIN performance and referential integrity checks
    
  2. New Indexes
    - tbl_admin_activity_logs: taal_admin_id
    - tbl_admin_users: tau_created_by
    - tbl_daily_tasks: tdt_coupon_id, tdt_created_by
    - tbl_mlm_tree: tmt_left_child_id, tmt_right_child_id
    - tbl_payments: tp_subscription_id
    - tbl_social_shares: tss_coupon_id, tss_task_id, tss_verified_by
    - tbl_user_subscriptions: tus_plan_id
    - tbl_user_tasks: tut_verified_by
*/

-- Admin activity logs
CREATE INDEX IF NOT EXISTS idx_tbl_admin_activity_logs_admin_id 
  ON tbl_admin_activity_logs(taal_admin_id);

-- Admin users
CREATE INDEX IF NOT EXISTS idx_tbl_admin_users_created_by 
  ON tbl_admin_users(tau_created_by);

-- Daily tasks
CREATE INDEX IF NOT EXISTS idx_tbl_daily_tasks_coupon_id 
  ON tbl_daily_tasks(tdt_coupon_id);

CREATE INDEX IF NOT EXISTS idx_tbl_daily_tasks_created_by 
  ON tbl_daily_tasks(tdt_created_by);

-- MLM tree
CREATE INDEX IF NOT EXISTS idx_tbl_mlm_tree_left_child 
  ON tbl_mlm_tree(tmt_left_child_id);

CREATE INDEX IF NOT EXISTS idx_tbl_mlm_tree_right_child 
  ON tbl_mlm_tree(tmt_right_child_id);

-- Payments
CREATE INDEX IF NOT EXISTS idx_tbl_payments_subscription_id 
  ON tbl_payments(tp_subscription_id);

-- Social shares
CREATE INDEX IF NOT EXISTS idx_tbl_social_shares_coupon_id 
  ON tbl_social_shares(tss_coupon_id);

CREATE INDEX IF NOT EXISTS idx_tbl_social_shares_task_id 
  ON tbl_social_shares(tss_task_id);

CREATE INDEX IF NOT EXISTS idx_tbl_social_shares_verified_by 
  ON tbl_social_shares(tss_verified_by);

-- User subscriptions
CREATE INDEX IF NOT EXISTS idx_tbl_user_subscriptions_plan_id 
  ON tbl_user_subscriptions(tus_plan_id);

-- User tasks
CREATE INDEX IF NOT EXISTS idx_tbl_user_tasks_verified_by 
  ON tbl_user_tasks(tut_verified_by);

-- Add comments
COMMENT ON INDEX idx_tbl_admin_activity_logs_admin_id IS 'Improves JOIN performance for admin activity logs';
COMMENT ON INDEX idx_tbl_admin_users_created_by IS 'Improves JOIN performance for admin user relationships';
COMMENT ON INDEX idx_tbl_daily_tasks_coupon_id IS 'Improves JOIN performance for daily task coupons';
COMMENT ON INDEX idx_tbl_daily_tasks_created_by IS 'Improves JOIN performance for daily task creators';
COMMENT ON INDEX idx_tbl_mlm_tree_left_child IS 'Improves tree traversal performance for left children';
COMMENT ON INDEX idx_tbl_mlm_tree_right_child IS 'Improves tree traversal performance for right children';
COMMENT ON INDEX idx_tbl_payments_subscription_id IS 'Improves JOIN performance for payment subscriptions';
COMMENT ON INDEX idx_tbl_social_shares_coupon_id IS 'Improves JOIN performance for social share coupons';
COMMENT ON INDEX idx_tbl_social_shares_task_id IS 'Improves JOIN performance for social share tasks';
COMMENT ON INDEX idx_tbl_social_shares_verified_by IS 'Improves JOIN performance for social share verifiers';
COMMENT ON INDEX idx_tbl_user_subscriptions_plan_id IS 'Improves JOIN performance for user subscription plans';
COMMENT ON INDEX idx_tbl_user_tasks_verified_by IS 'Improves JOIN performance for user task verifiers';