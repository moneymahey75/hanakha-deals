/*
  # Comprehensive Admin RPC Functions

  1. New Functions
    - admin_get_companies - Get all companies with filters
    - admin_get_coupons - Get all coupons with filters
    - admin_get_daily_tasks - Get all daily tasks
    - admin_get_subscriptions - Get all subscriptions with filters
    - admin_get_payments - Get pending payments
    - admin_get_wallets - Get all wallet information
    - admin_get_system_settings - Get system settings
    - admin_update_system_setting - Update a system setting

  2. Security
    - All functions use SECURITY DEFINER to bypass RLS
    - All functions are granted to authenticated and anon
    - Functions are designed for admin panel use
*/

-- Function to get companies for admin
CREATE OR REPLACE FUNCTION admin_get_companies(
  p_search_term TEXT DEFAULT NULL,
  p_status_filter TEXT DEFAULT 'all',
  p_offset INT DEFAULT 0,
  p_limit INT DEFAULT 10
)
RETURNS TABLE (
  tc_id UUID,
  tc_user_id UUID,
  tc_company_name TEXT,
  tc_brand_name TEXT,
  tc_business_type TEXT,
  tc_business_category TEXT,
  tc_registration_number TEXT,
  tc_gstin TEXT,
  tc_website_url TEXT,
  tc_official_email TEXT,
  tc_affiliate_code TEXT,
  tc_is_verified BOOLEAN,
  tc_is_active BOOLEAN,
  tc_created_at TIMESTAMPTZ,
  tc_updated_at TIMESTAMPTZ,
  user_email TEXT,
  total_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_count BIGINT;
BEGIN
  SELECT COUNT(*)
  INTO v_total_count
  FROM tbl_companies c
  LEFT JOIN tbl_users u ON c.tc_user_id = u.tu_id
  WHERE (p_search_term IS NULL OR
         c.tc_company_name ILIKE '%' || p_search_term || '%' OR
         c.tc_brand_name ILIKE '%' || p_search_term || '%' OR
         c.tc_affiliate_code ILIKE '%' || p_search_term || '%' OR
         u.tu_email ILIKE '%' || p_search_term || '%')
    AND (p_status_filter = 'all' OR
         (p_status_filter = 'active' AND c.tc_is_active = true) OR
         (p_status_filter = 'inactive' AND c.tc_is_active = false));

  RETURN QUERY
  SELECT
    c.tc_id,
    c.tc_user_id,
    c.tc_company_name,
    c.tc_brand_name,
    c.tc_business_type,
    c.tc_business_category,
    c.tc_registration_number,
    c.tc_gstin,
    c.tc_website_url,
    c.tc_official_email,
    c.tc_affiliate_code,
    c.tc_is_verified,
    c.tc_is_active,
    c.tc_created_at,
    c.tc_updated_at,
    u.tu_email as user_email,
    v_total_count
  FROM tbl_companies c
  LEFT JOIN tbl_users u ON c.tc_user_id = u.tu_id
  WHERE (p_search_term IS NULL OR
         c.tc_company_name ILIKE '%' || p_search_term || '%' OR
         c.tc_brand_name ILIKE '%' || p_search_term || '%' OR
         c.tc_affiliate_code ILIKE '%' || p_search_term || '%' OR
         u.tu_email ILIKE '%' || p_search_term || '%')
    AND (p_status_filter = 'all' OR
         (p_status_filter = 'active' AND c.tc_is_active = true) OR
         (p_status_filter = 'inactive' AND c.tc_is_active = false))
  ORDER BY c.tc_created_at DESC
  OFFSET p_offset
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_get_companies(TEXT, TEXT, INT, INT) TO authenticated, anon;

-- Function to get coupons for admin
CREATE OR REPLACE FUNCTION admin_get_coupons(
  p_search_term TEXT DEFAULT NULL,
  p_status_filter TEXT DEFAULT 'all',
  p_offset INT DEFAULT 0,
  p_limit INT DEFAULT 10
)
RETURNS TABLE (
  tcc_id UUID,
  tcc_company_id UUID,
  tcc_coupon_code TEXT,
  tcc_description TEXT,
  tcc_discount_type TEXT,
  tcc_discount_value NUMERIC,
  tcc_valid_from TIMESTAMPTZ,
  tcc_valid_to TIMESTAMPTZ,
  tcc_is_active BOOLEAN,
  tcc_max_uses INT,
  tcc_used_count INT,
  tcc_created_at TIMESTAMPTZ,
  company_name TEXT,
  total_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_count BIGINT;
BEGIN
  SELECT COUNT(*)
  INTO v_total_count
  FROM tbl_company_coupons c
  LEFT JOIN tbl_companies comp ON c.tcc_company_id = comp.tc_id
  WHERE (p_search_term IS NULL OR
         c.tcc_coupon_code ILIKE '%' || p_search_term || '%' OR
         c.tcc_description ILIKE '%' || p_search_term || '%' OR
         comp.tc_company_name ILIKE '%' || p_search_term || '%')
    AND (p_status_filter = 'all' OR
         (p_status_filter = 'active' AND c.tcc_is_active = true) OR
         (p_status_filter = 'inactive' AND c.tcc_is_active = false));

  RETURN QUERY
  SELECT
    c.tcc_id,
    c.tcc_company_id,
    c.tcc_coupon_code,
    c.tcc_description,
    c.tcc_discount_type,
    c.tcc_discount_value,
    c.tcc_valid_from,
    c.tcc_valid_to,
    c.tcc_is_active,
    c.tcc_max_uses,
    c.tcc_used_count,
    c.tcc_created_at,
    comp.tc_company_name as company_name,
    v_total_count
  FROM tbl_company_coupons c
  LEFT JOIN tbl_companies comp ON c.tcc_company_id = comp.tc_id
  WHERE (p_search_term IS NULL OR
         c.tcc_coupon_code ILIKE '%' || p_search_term || '%' OR
         c.tcc_description ILIKE '%' || p_search_term || '%' OR
         comp.tc_company_name ILIKE '%' || p_search_term || '%')
    AND (p_status_filter = 'all' OR
         (p_status_filter = 'active' AND c.tcc_is_active = true) OR
         (p_status_filter = 'inactive' AND c.tcc_is_active = false))
  ORDER BY c.tcc_created_at DESC
  OFFSET p_offset
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_get_coupons(TEXT, TEXT, INT, INT) TO authenticated, anon;

-- Function to get daily tasks for admin
CREATE OR REPLACE FUNCTION admin_get_daily_tasks(
  p_offset INT DEFAULT 0,
  p_limit INT DEFAULT 50
)
RETURNS TABLE (
  tdt_id UUID,
  tdt_task_title TEXT,
  tdt_task_description TEXT,
  tdt_task_type TEXT,
  tdt_reward_points NUMERIC,
  tdt_is_active BOOLEAN,
  tdt_created_at TIMESTAMPTZ,
  tdt_updated_at TIMESTAMPTZ,
  total_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_count BIGINT;
BEGIN
  SELECT COUNT(*)
  INTO v_total_count
  FROM tbl_daily_tasks;

  RETURN QUERY
  SELECT
    dt.tdt_id,
    dt.tdt_task_title,
    dt.tdt_task_description,
    dt.tdt_task_type,
    dt.tdt_reward_points,
    dt.tdt_is_active,
    dt.tdt_created_at,
    dt.tdt_updated_at,
    v_total_count
  FROM tbl_daily_tasks dt
  ORDER BY dt.tdt_created_at DESC
  OFFSET p_offset
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_get_daily_tasks(INT, INT) TO authenticated, anon;

-- Function to get subscriptions for admin
CREATE OR REPLACE FUNCTION admin_get_subscriptions(
  p_search_term TEXT DEFAULT NULL,
  p_status_filter TEXT DEFAULT 'all',
  p_offset INT DEFAULT 0,
  p_limit INT DEFAULT 10
)
RETURNS TABLE (
  tus_id UUID,
  tus_user_id UUID,
  tus_plan_id UUID,
  tus_status TEXT,
  tus_start_date TIMESTAMPTZ,
  tus_end_date TIMESTAMPTZ,
  tus_created_at TIMESTAMPTZ,
  user_email TEXT,
  plan_name TEXT,
  plan_amount NUMERIC,
  total_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_count BIGINT;
BEGIN
  SELECT COUNT(*)
  INTO v_total_count
  FROM tbl_user_subscriptions s
  LEFT JOIN tbl_users u ON s.tus_user_id = u.tu_id
  LEFT JOIN tbl_subscription_plans p ON s.tus_plan_id = p.tsp_id
  WHERE (p_search_term IS NULL OR
         u.tu_email ILIKE '%' || p_search_term || '%' OR
         p.tsp_name ILIKE '%' || p_search_term || '%')
    AND (p_status_filter = 'all' OR s.tus_status = p_status_filter);

  RETURN QUERY
  SELECT
    s.tus_id,
    s.tus_user_id,
    s.tus_plan_id,
    s.tus_status,
    s.tus_start_date,
    s.tus_end_date,
    s.tus_created_at,
    u.tu_email as user_email,
    p.tsp_name as plan_name,
    p.tsp_amount as plan_amount,
    v_total_count
  FROM tbl_user_subscriptions s
  LEFT JOIN tbl_users u ON s.tus_user_id = u.tu_id
  LEFT JOIN tbl_subscription_plans p ON s.tus_plan_id = p.tsp_id
  WHERE (p_search_term IS NULL OR
         u.tu_email ILIKE '%' || p_search_term || '%' OR
         p.tsp_name ILIKE '%' || p_search_term || '%')
    AND (p_status_filter = 'all' OR s.tus_status = p_status_filter)
  ORDER BY s.tus_created_at DESC
  OFFSET p_offset
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_get_subscriptions(TEXT, TEXT, INT, INT) TO authenticated, anon;

-- Function to get pending payments for admin
CREATE OR REPLACE FUNCTION admin_get_pending_payments(
  p_offset INT DEFAULT 0,
  p_limit INT DEFAULT 10
)
RETURNS TABLE (
  tpt_id UUID,
  tpt_user_id UUID,
  tpt_amount NUMERIC,
  tpt_currency TEXT,
  tpt_payment_method TEXT,
  tpt_payment_status TEXT,
  tpt_transaction_id TEXT,
  tpt_created_at TIMESTAMPTZ,
  user_email TEXT,
  user_name TEXT,
  total_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_count BIGINT;
BEGIN
  SELECT COUNT(*)
  INTO v_total_count
  FROM tbl_payment_transactions pt
  LEFT JOIN tbl_users u ON pt.tpt_user_id = u.tu_id
  LEFT JOIN tbl_user_profiles p ON u.tu_id = p.tup_user_id
  WHERE pt.tpt_payment_status = 'pending';

  RETURN QUERY
  SELECT
    pt.tpt_id,
    pt.tpt_user_id,
    pt.tpt_amount,
    pt.tpt_currency,
    pt.tpt_payment_method,
    pt.tpt_payment_status,
    pt.tpt_transaction_id,
    pt.tpt_created_at,
    u.tu_email as user_email,
    CONCAT(p.tup_first_name, ' ', p.tup_last_name) as user_name,
    v_total_count
  FROM tbl_payment_transactions pt
  LEFT JOIN tbl_users u ON pt.tpt_user_id = u.tu_id
  LEFT JOIN tbl_user_profiles p ON u.tu_id = p.tup_user_id
  WHERE pt.tpt_payment_status = 'pending'
  ORDER BY pt.tpt_created_at DESC
  OFFSET p_offset
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_get_pending_payments(INT, INT) TO authenticated, anon;

-- Function to get wallets for admin
CREATE OR REPLACE FUNCTION admin_get_wallets(
  p_search_term TEXT DEFAULT NULL,
  p_offset INT DEFAULT 0,
  p_limit INT DEFAULT 10
)
RETURNS TABLE (
  tuw_id UUID,
  tuw_user_id UUID,
  tuw_wallet_address TEXT,
  tuw_wallet_type TEXT,
  tuw_is_primary BOOLEAN,
  tuw_balance NUMERIC,
  tuw_created_at TIMESTAMPTZ,
  user_email TEXT,
  user_name TEXT,
  total_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_count BIGINT;
BEGIN
  SELECT COUNT(*)
  INTO v_total_count
  FROM tbl_user_wallets w
  LEFT JOIN tbl_users u ON w.tuw_user_id = u.tu_id
  LEFT JOIN tbl_user_profiles p ON u.tu_id = p.tup_user_id
  WHERE (p_search_term IS NULL OR
         w.tuw_wallet_address ILIKE '%' || p_search_term || '%' OR
         u.tu_email ILIKE '%' || p_search_term || '%' OR
         p.tup_first_name ILIKE '%' || p_search_term || '%' OR
         p.tup_last_name ILIKE '%' || p_search_term || '%');

  RETURN QUERY
  SELECT
    w.tuw_id,
    w.tuw_user_id,
    w.tuw_wallet_address,
    w.tuw_wallet_type,
    w.tuw_is_primary,
    w.tuw_balance,
    w.tuw_created_at,
    u.tu_email as user_email,
    CONCAT(p.tup_first_name, ' ', p.tup_last_name) as user_name,
    v_total_count
  FROM tbl_user_wallets w
  LEFT JOIN tbl_users u ON w.tuw_user_id = u.tu_id
  LEFT JOIN tbl_user_profiles p ON u.tu_id = p.tup_user_id
  WHERE (p_search_term IS NULL OR
         w.tuw_wallet_address ILIKE '%' || p_search_term || '%' OR
         u.tu_email ILIKE '%' || p_search_term || '%' OR
         p.tup_first_name ILIKE '%' || p_search_term || '%' OR
         p.tup_last_name ILIKE '%' || p_search_term || '%')
  ORDER BY w.tuw_created_at DESC
  OFFSET p_offset
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_get_wallets(TEXT, INT, INT) TO authenticated, anon;

-- Function to get system settings for admin
CREATE OR REPLACE FUNCTION admin_get_system_settings()
RETURNS TABLE (
  tss_id UUID,
  tss_setting_key TEXT,
  tss_setting_value TEXT,
  tss_description TEXT,
  tss_updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.tss_id,
    s.tss_setting_key,
    s.tss_setting_value,
    s.tss_description,
    s.tss_updated_at
  FROM tbl_system_settings s
  ORDER BY s.tss_setting_key;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_get_system_settings() TO authenticated, anon;

-- Function to update system setting for admin
CREATE OR REPLACE FUNCTION admin_update_system_setting(
  p_setting_key TEXT,
  p_setting_value TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE tbl_system_settings
  SET
    tss_setting_value = p_setting_value,
    tss_updated_at = now()
  WHERE tss_setting_key = p_setting_key;

  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_update_system_setting(TEXT, TEXT) TO authenticated, anon;

-- Comments
COMMENT ON FUNCTION admin_get_companies IS 'Get companies for admin dashboard with filters';
COMMENT ON FUNCTION admin_get_coupons IS 'Get coupons for admin dashboard with filters';
COMMENT ON FUNCTION admin_get_daily_tasks IS 'Get daily tasks for admin dashboard';
COMMENT ON FUNCTION admin_get_subscriptions IS 'Get subscriptions for admin dashboard with filters';
COMMENT ON FUNCTION admin_get_pending_payments IS 'Get pending payments for admin dashboard';
COMMENT ON FUNCTION admin_get_wallets IS 'Get wallets for admin dashboard with filters';
COMMENT ON FUNCTION admin_get_system_settings IS 'Get all system settings for admin';
COMMENT ON FUNCTION admin_update_system_setting IS 'Update a system setting value';
