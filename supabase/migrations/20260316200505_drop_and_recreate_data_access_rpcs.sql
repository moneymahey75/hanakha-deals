/*
  # Drop and Recreate Secure RPC Functions

  This migration drops existing conflicting functions and creates a comprehensive set of 
  secure RPC functions for data access, reducing reliance on complex RLS policies.

  ## Functions Created
  - User data access functions
  - MLM network functions  
  - Transaction management functions
  - Wallet management functions

  ## Security
  - SECURITY DEFINER to bypass RLS
  - Authentication checks in every function
  - Admin role verification where needed
*/

-- Drop existing functions if they exist
DROP FUNCTION IF EXISTS get_user_data(uuid);
DROP FUNCTION IF EXISTS get_user_dashboard_data();
DROP FUNCTION IF EXISTS update_user_profile(text, text, text);
DROP FUNCTION IF EXISTS get_user_network(uuid);
DROP FUNCTION IF EXISTS get_referral_stats(uuid);
DROP FUNCTION IF EXISTS get_user_transactions(integer, integer);
DROP FUNCTION IF EXISTS get_user_wallet_summary();

-- =====================================================
-- USER DATA ACCESS FUNCTIONS
-- =====================================================

-- Get complete user data
CREATE FUNCTION get_user_data(p_user_id uuid DEFAULT NULL)
RETURNS JSON
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_result json;
  v_target_user_id uuid;
BEGIN
  v_target_user_id := COALESCE(p_user_id, auth.uid());
  
  -- Check permission
  IF v_target_user_id != auth.uid() AND NOT is_super_admin() AND NOT is_sub_admin() THEN
    RETURN NULL;
  END IF;
  
  SELECT json_build_object(
    'user_id', u.tu_id,
    'email', u.tu_email,
    'user_type', u.tu_user_type,
    'is_verified', u.tu_is_verified,
    'is_active', u.tu_is_active,
    'email_verified', u.tu_email_verified,
    'mobile_verified', u.tu_mobile_verified,
    'first_name', up.tup_first_name,
    'last_name', up.tup_last_name,
    'username', up.tup_username,
    'mobile', up.tup_mobile,
    'sponsorship_number', up.tup_sponsorship_number,
    'parent_account', up.tup_parent_account,
    'has_active_subscription', (s.tus_id IS NOT NULL AND s.tus_status = 'active' AND s.tus_end_date > NOW()),
    'subscription_plan_name', sp.tsp_name,
    'subscription_end_date', s.tus_end_date
  ) INTO v_result
  FROM tbl_users u
  LEFT JOIN tbl_user_profiles up ON up.tup_user_id = u.tu_id
  LEFT JOIN tbl_user_subscriptions s ON s.tus_user_id = u.tu_id 
    AND s.tus_status = 'active' 
    AND s.tus_end_date > NOW()
  LEFT JOIN tbl_subscription_plans sp ON sp.tsp_id = s.tus_plan_id
  WHERE u.tu_id = v_target_user_id;
  
  RETURN v_result;
END;
$$;

-- Get dashboard data
CREATE FUNCTION get_user_dashboard_data()
RETURNS JSON
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_result json;
  v_user_id uuid;
  v_sponsorship text;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN NULL;
  END IF;
  
  SELECT tup_sponsorship_number INTO v_sponsorship
  FROM tbl_user_profiles
  WHERE tup_user_id = v_user_id;
  
  SELECT json_build_object(
    'user', get_user_data(v_user_id),
    'wallet_balance', (SELECT COALESCE(SUM(tw_balance), 0) FROM tbl_wallets WHERE tw_user_id = v_user_id),
    'total_referrals', (SELECT COUNT(*) FROM tbl_user_profiles WHERE tup_parent_account = v_sponsorship),
    'pending_tasks', (SELECT COUNT(*) FROM tbl_user_tasks WHERE tut_user_id = v_user_id AND tut_status = 'pending'),
    'completed_tasks_today', (SELECT COUNT(*) FROM tbl_user_tasks WHERE tut_user_id = v_user_id AND tut_status = 'completed' AND DATE(tut_completed_at) = CURRENT_DATE)
  ) INTO v_result;
  
  RETURN v_result;
END;
$$;

-- Update user profile
CREATE FUNCTION update_user_profile(
  p_first_name text DEFAULT NULL,
  p_last_name text DEFAULT NULL,
  p_mobile text DEFAULT NULL
)
RETURNS boolean
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;
  
  UPDATE tbl_user_profiles
  SET 
    tup_first_name = COALESCE(p_first_name, tup_first_name),
    tup_last_name = COALESCE(p_last_name, tup_last_name),
    tup_mobile = COALESCE(p_mobile, tup_mobile),
    tup_updated_at = NOW()
  WHERE tup_user_id = v_user_id;
  
  RETURN FOUND;
END;
$$;

-- =====================================================
-- MLM FUNCTIONS
-- =====================================================

CREATE FUNCTION get_user_network(p_user_id uuid DEFAULT NULL)
RETURNS JSON
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_result json;
  v_target_user_id uuid;
  v_user_sponsorship text;
BEGIN
  v_target_user_id := COALESCE(p_user_id, auth.uid());
  
  -- Check permission
  IF v_target_user_id != auth.uid() AND NOT is_super_admin() AND NOT is_sub_admin() THEN
    RETURN NULL;
  END IF;
  
  SELECT tup_sponsorship_number INTO v_user_sponsorship
  FROM tbl_user_profiles
  WHERE tup_user_id = v_target_user_id;
  
  WITH RECURSIVE network_tree AS (
    SELECT 
      up.tup_user_id,
      up.tup_username,
      up.tup_first_name,
      up.tup_last_name,
      up.tup_sponsorship_number,
      up.tup_parent_account,
      1 as level,
      up.tup_created_at
    FROM tbl_user_profiles up
    WHERE up.tup_parent_account = v_user_sponsorship
    
    UNION ALL
    
    SELECT 
      up.tup_user_id,
      up.tup_username,
      up.tup_first_name,
      up.tup_last_name,
      up.tup_sponsorship_number,
      up.tup_parent_account,
      nt.level + 1,
      up.tup_created_at
    FROM tbl_user_profiles up
    INNER JOIN network_tree nt ON up.tup_parent_account = nt.tup_sponsorship_number
    WHERE nt.level < 10
  )
  SELECT json_agg(
    json_build_object(
      'user_id', tup_user_id,
      'username', tup_username,
      'first_name', tup_first_name,
      'last_name', tup_last_name,
      'sponsorship_number', tup_sponsorship_number,
      'parent_sponsorship_number', tup_parent_account,
      'level', level,
      'joined_date', tup_created_at
    ) ORDER BY level, tup_created_at
  ) INTO v_result
  FROM network_tree;
  
  RETURN COALESCE(v_result, '[]'::json);
END;
$$;

CREATE FUNCTION get_referral_stats(p_user_id uuid DEFAULT NULL)
RETURNS JSON
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_result json;
  v_user_id uuid;
  v_sponsorship text;
BEGIN
  v_user_id := COALESCE(p_user_id, auth.uid());
  
  IF v_user_id != auth.uid() AND NOT is_super_admin() AND NOT is_sub_admin() THEN
    RETURN NULL;
  END IF;
  
  SELECT tup_sponsorship_number INTO v_sponsorship
  FROM tbl_user_profiles
  WHERE tup_user_id = v_user_id;
  
  SELECT json_build_object(
    'direct_referrals', (SELECT COUNT(*) FROM tbl_user_profiles WHERE tup_parent_account = v_sponsorship),
    'total_earnings', (SELECT COALESCE(SUM(tri_amount), 0) FROM tbl_referral_income WHERE tri_referrer_id = v_user_id),
    'this_month_earnings', (SELECT COALESCE(SUM(tri_amount), 0) FROM tbl_referral_income WHERE tri_referrer_id = v_user_id AND DATE_TRUNC('month', tri_created_at) = DATE_TRUNC('month', CURRENT_DATE))
  ) INTO v_result;
  
  RETURN v_result;
END;
$$;

-- =====================================================
-- TRANSACTION FUNCTIONS
-- =====================================================

CREATE FUNCTION get_user_transactions(
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS JSON
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_result json;
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN '[]'::json;
  END IF;
  
  SELECT json_agg(
    json_build_object(
      'transaction_id', twt_id,
      'wallet_type', twt_wallet_type,
      'transaction_type', twt_transaction_type,
      'amount', twt_amount,
      'balance_after', twt_balance_after,
      'description', twt_description,
      'created_at', twt_created_at
    ) ORDER BY twt_created_at DESC
  ) INTO v_result
  FROM (
    SELECT *
    FROM tbl_wallet_transactions
    WHERE twt_user_id = v_user_id
    ORDER BY twt_created_at DESC
    LIMIT p_limit
    OFFSET p_offset
  ) sub;
  
  RETURN COALESCE(v_result, '[]'::json);
END;
$$;

CREATE FUNCTION get_user_wallet_summary()
RETURNS JSON
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_result json;
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN NULL;
  END IF;
  
  SELECT json_build_object(
    'wallets', (
      SELECT COALESCE(json_agg(json_build_object(
        'type', tw_wallet_type,
        'balance', tw_balance,
        'is_active', tw_is_active
      )), '[]'::json)
      FROM tbl_wallets
      WHERE tw_user_id = v_user_id
    ),
    'total_balance', (SELECT COALESCE(SUM(tw_balance), 0) FROM tbl_wallets WHERE tw_user_id = v_user_id),
    'total_deposits', (SELECT COALESCE(SUM(twt_amount), 0) FROM tbl_wallet_transactions WHERE twt_user_id = v_user_id AND twt_transaction_type = 'deposit'),
    'total_withdrawals', (SELECT COALESCE(SUM(twt_amount), 0) FROM tbl_wallet_transactions WHERE twt_user_id = v_user_id AND twt_transaction_type = 'withdrawal')
  ) INTO v_result;
  
  RETURN v_result;
END;
$$;

-- =====================================================
-- GRANT PERMISSIONS
-- =====================================================

GRANT EXECUTE ON FUNCTION get_user_data(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_user_dashboard_data() TO authenticated;
GRANT EXECUTE ON FUNCTION update_user_profile(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_network(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_referral_stats(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_transactions(integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_wallet_summary() TO authenticated;
