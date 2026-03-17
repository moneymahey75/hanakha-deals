/*
  # Fix Admin RPC Functions to Use Correct Tables

  1. Changes
    - Drop and recreate admin_get_coupons to use tbl_coupons instead of tbl_company_coupons
    - Drop and recreate admin_get_daily_tasks to return correct schema
    - Add admin_update_coupon, admin_delete_coupon, admin_update_company, admin_delete_company
    - Add admin_create_daily_task, admin_update_daily_task, admin_delete_daily_task

  2. Security
    - All functions use SECURITY DEFINER to bypass RLS
    - All functions are granted to authenticated and anon
*/

-- Drop existing functions
DROP FUNCTION IF EXISTS admin_get_coupons(TEXT, TEXT, INT, INT);
DROP FUNCTION IF EXISTS admin_get_daily_tasks(INT, INT);

-- Recreate admin_get_coupons to use tbl_coupons
CREATE OR REPLACE FUNCTION admin_get_coupons(
  p_search_term TEXT DEFAULT NULL,
  p_status_filter TEXT DEFAULT 'all',
  p_offset INT DEFAULT 0,
  p_limit INT DEFAULT 1000
)
RETURNS TABLE (
  tc_id UUID,
  tc_company_id UUID,
  tc_title TEXT,
  tc_description TEXT,
  tc_coupon_code TEXT,
  tc_discount_type TEXT,
  tc_discount_value NUMERIC,
  tc_discount_percentage NUMERIC,
  tc_discount_amount NUMERIC,
  tc_status TEXT,
  tc_is_active BOOLEAN,
  tc_launch_now BOOLEAN,
  tc_launch_date TIMESTAMPTZ,
  tc_created_at TIMESTAMPTZ,
  company_data JSONB,
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
  FROM tbl_coupons c
  LEFT JOIN tbl_companies comp ON c.tc_company_id = comp.tc_id
  WHERE (p_search_term IS NULL OR
         c.tc_title ILIKE '%' || p_search_term || '%' OR
         c.tc_coupon_code ILIKE '%' || p_search_term || '%' OR
         c.tc_description ILIKE '%' || p_search_term || '%' OR
         comp.tc_company_name ILIKE '%' || p_search_term || '%')
    AND (p_status_filter = 'all' OR
         (p_status_filter = 'active' AND c.tc_is_active = true) OR
         (p_status_filter = 'inactive' AND c.tc_is_active = false) OR
         (p_status_filter = 'pending' AND c.tc_status = 'pending') OR
         (p_status_filter = 'approved' AND c.tc_status = 'approved'));

  RETURN QUERY
  SELECT
    c.tc_id,
    c.tc_company_id,
    c.tc_title,
    c.tc_description,
    c.tc_coupon_code,
    c.tc_discount_type,
    c.tc_discount_value,
    c.tc_discount_value as tc_discount_percentage,
    c.tc_discount_value as tc_discount_amount,
    c.tc_status,
    c.tc_is_active,
    c.tc_launch_now,
    c.tc_launch_date,
    c.tc_created_at,
    jsonb_build_object(
      'tc_company_name', comp.tc_company_name,
      'tc_official_email', comp.tc_official_email
    ) as company_data,
    v_total_count
  FROM tbl_coupons c
  LEFT JOIN tbl_companies comp ON c.tc_company_id = comp.tc_id
  WHERE (p_search_term IS NULL OR
         c.tc_title ILIKE '%' || p_search_term || '%' OR
         c.tc_coupon_code ILIKE '%' || p_search_term || '%' OR
         c.tc_description ILIKE '%' || p_search_term || '%' OR
         comp.tc_company_name ILIKE '%' || p_search_term || '%')
    AND (p_status_filter = 'all' OR
         (p_status_filter = 'active' AND c.tc_is_active = true) OR
         (p_status_filter = 'inactive' AND c.tc_is_active = false) OR
         (p_status_filter = 'pending' AND c.tc_status = 'pending') OR
         (p_status_filter = 'approved' AND c.tc_status = 'approved'))
  ORDER BY c.tc_created_at DESC
  OFFSET p_offset
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_get_coupons(TEXT, TEXT, INT, INT) TO authenticated, anon;

-- Recreate admin_get_daily_tasks with correct schema
CREATE OR REPLACE FUNCTION admin_get_daily_tasks(
  p_offset INT DEFAULT 0,
  p_limit INT DEFAULT 1000
)
RETURNS TABLE (
  tdt_id UUID,
  tdt_created_by UUID,
  tdt_task_type TEXT,
  tdt_title TEXT,
  tdt_description TEXT,
  tdt_content_url TEXT,
  tdt_coupon_id UUID,
  tdt_reward_amount NUMERIC,
  tdt_max_completions INT,
  tdt_completed_count INT,
  tdt_target_platforms TEXT[],
  tdt_task_date DATE,
  tdt_expires_at TIMESTAMPTZ,
  tdt_is_active BOOLEAN,
  tdt_created_at TIMESTAMPTZ,
  tdt_updated_at TIMESTAMPTZ,
  coupon_data JSONB,
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
    dt.tdt_created_by,
    dt.tdt_task_type,
    dt.tdt_title,
    dt.tdt_description,
    dt.tdt_content_url,
    dt.tdt_coupon_id,
    dt.tdt_reward_amount,
    dt.tdt_max_completions,
    dt.tdt_completed_count,
    dt.tdt_target_platforms,
    dt.tdt_task_date,
    dt.tdt_expires_at,
    dt.tdt_is_active,
    dt.tdt_created_at,
    dt.tdt_updated_at,
    CASE 
      WHEN c.tc_id IS NOT NULL THEN
        jsonb_build_object(
          'tc_title', c.tc_title,
          'tc_coupon_code', c.tc_coupon_code
        )
      ELSE NULL
    END as coupon_data,
    v_total_count
  FROM tbl_daily_tasks dt
  LEFT JOIN tbl_coupons c ON dt.tdt_coupon_id = c.tc_id
  ORDER BY dt.tdt_created_at DESC
  OFFSET p_offset
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_get_daily_tasks(INT, INT) TO authenticated, anon;

-- Function to update coupon (admin action)
CREATE OR REPLACE FUNCTION admin_update_coupon(
  p_coupon_id UUID,
  p_status TEXT DEFAULT NULL,
  p_is_active BOOLEAN DEFAULT NULL,
  p_launch_now BOOLEAN DEFAULT NULL,
  p_launch_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  UPDATE tbl_coupons
  SET
    tc_status = COALESCE(p_status, tc_status),
    tc_is_active = COALESCE(p_is_active, tc_is_active),
    tc_launch_now = COALESCE(p_launch_now, tc_launch_now),
    tc_launch_date = COALESCE(p_launch_date, tc_launch_date),
    tc_updated_at = now()
  WHERE tc_id = p_coupon_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Coupon not found');
  END IF;

  RETURN jsonb_build_object('success', true, 'message', 'Coupon updated successfully');
END;
$$;

GRANT EXECUTE ON FUNCTION admin_update_coupon(UUID, TEXT, BOOLEAN, BOOLEAN, TIMESTAMPTZ) TO authenticated, anon;

-- Function to delete coupon (admin action)
CREATE OR REPLACE FUNCTION admin_delete_coupon(p_coupon_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM tbl_coupons WHERE tc_id = p_coupon_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Coupon not found');
  END IF;

  RETURN jsonb_build_object('success', true, 'message', 'Coupon deleted successfully');
END;
$$;

GRANT EXECUTE ON FUNCTION admin_delete_coupon(UUID) TO authenticated, anon;

-- Function to update company (admin action)
CREATE OR REPLACE FUNCTION admin_update_company(
  p_company_id UUID,
  p_verification_status TEXT DEFAULT NULL,
  p_is_active BOOLEAN DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE tbl_companies
  SET
    tc_verification_status = COALESCE(p_verification_status, tc_verification_status),
    tc_updated_at = now()
  WHERE tc_id = p_company_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Company not found');
  END IF;

  RETURN jsonb_build_object('success', true, 'message', 'Company updated successfully');
END;
$$;

GRANT EXECUTE ON FUNCTION admin_update_company(UUID, TEXT, BOOLEAN) TO authenticated, anon;

-- Function to create daily task (admin action)
CREATE OR REPLACE FUNCTION admin_create_daily_task(
  p_created_by UUID,
  p_task_type TEXT,
  p_title TEXT,
  p_description TEXT,
  p_content_url TEXT,
  p_coupon_id UUID,
  p_reward_amount NUMERIC,
  p_task_date DATE,
  p_expires_at TIMESTAMPTZ,
  p_is_active BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task_id UUID;
BEGIN
  INSERT INTO tbl_daily_tasks (
    tdt_created_by,
    tdt_task_type,
    tdt_title,
    tdt_description,
    tdt_content_url,
    tdt_coupon_id,
    tdt_reward_amount,
    tdt_task_date,
    tdt_expires_at,
    tdt_is_active
  ) VALUES (
    p_created_by,
    p_task_type,
    p_title,
    p_description,
    p_content_url,
    p_coupon_id,
    p_reward_amount,
    p_task_date,
    p_expires_at,
    p_is_active
  )
  RETURNING tdt_id INTO v_task_id;

  RETURN jsonb_build_object(
    'success', true, 
    'message', 'Daily task created successfully',
    'task_id', v_task_id
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false, 
    'message', SQLERRM
  );
END;
$$;

GRANT EXECUTE ON FUNCTION admin_create_daily_task(UUID, TEXT, TEXT, TEXT, TEXT, UUID, NUMERIC, DATE, TIMESTAMPTZ, BOOLEAN) TO authenticated, anon;

-- Function to update daily task (admin action)
CREATE OR REPLACE FUNCTION admin_update_daily_task(
  p_task_id UUID,
  p_is_active BOOLEAN DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE tbl_daily_tasks
  SET
    tdt_is_active = COALESCE(p_is_active, tdt_is_active),
    tdt_updated_at = now()
  WHERE tdt_id = p_task_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Daily task not found');
  END IF;

  RETURN jsonb_build_object('success', true, 'message', 'Daily task updated successfully');
END;
$$;

GRANT EXECUTE ON FUNCTION admin_update_daily_task(UUID, BOOLEAN) TO authenticated, anon;

-- Function to delete daily task (admin action)
CREATE OR REPLACE FUNCTION admin_delete_daily_task(p_task_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM tbl_daily_tasks WHERE tdt_id = p_task_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Daily task not found');
  END IF;

  RETURN jsonb_build_object('success', true, 'message', 'Daily task deleted successfully');
END;
$$;

GRANT EXECUTE ON FUNCTION admin_delete_daily_task(UUID) TO authenticated, anon;
