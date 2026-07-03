-- Lock down wallet mutation RPCs and enforce customer ownership on task/wallet readers.
-- Direct wallet credits/debits must not be callable from the browser.

REVOKE INSERT, UPDATE, DELETE ON TABLE public.tbl_wallets FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.tbl_wallets FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.tbl_wallet_transactions FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.tbl_wallet_transactions FROM authenticated;
GRANT ALL ON TABLE public.tbl_wallets TO service_role;
GRANT ALL ON TABLE public.tbl_wallet_transactions TO service_role;

DROP POLICY IF EXISTS "Users can update own wallet" ON public.tbl_wallets;
DROP POLICY IF EXISTS "System can insert wallets" ON public.tbl_wallets;
DROP POLICY IF EXISTS "user_insert_own" ON public.tbl_wallets;
DROP POLICY IF EXISTS "Users can create own transactions" ON public.tbl_wallet_transactions;
DROP POLICY IF EXISTS "user_insert_own" ON public.tbl_wallet_transactions;
DROP POLICY IF EXISTS "user_update_own" ON public.tbl_wallet_transactions;

CREATE OR REPLACE FUNCTION public.update_wallet_balance(
  p_user_id uuid,
  p_amount numeric(18,8),
  p_transaction_type text,
  p_description text,
  p_reference_type text DEFAULT NULL,
  p_reference_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wallet_id uuid;
  v_current_balance numeric(18,8);
  v_new_balance numeric(18,8);
  v_transaction_id uuid;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be greater than zero';
  END IF;

  IF NOT public.is_user_active_member(p_user_id) THEN
    RAISE EXCEPTION 'Account is not active/verified or registration-paid';
  END IF;

  IF public.is_user_on_launch_plan(p_user_id)
    AND p_transaction_type = 'credit'
    AND COALESCE(p_reference_type, '') IN (
      'task_reward',
      'coupon_share',
      'registration_parent_income',
      'registration_parent_income_reserved',
      'mlm_level_reward',
      'mlm_level_reward_reserved'
    )
  THEN
    RAISE EXCEPTION 'Pre-Launch reward system is disabled for Launch plan users';
  END IF;

  SELECT tw_id, tw_balance
  INTO v_wallet_id, v_current_balance
  FROM public.tbl_wallets
  WHERE tw_user_id = p_user_id
    AND tw_currency = 'USDT'
  ORDER BY CASE WHEN tw_wallet_type = 'working' THEN 0 ELSE 1 END
  LIMIT 1
  FOR UPDATE;

  IF v_wallet_id IS NULL THEN
    RAISE EXCEPTION 'Wallet not found for user';
  END IF;

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

  UPDATE public.tbl_wallets
  SET tw_balance = v_new_balance, tw_updated_at = now()
  WHERE tw_id = v_wallet_id;

  INSERT INTO public.tbl_wallet_transactions (
    twt_wallet_id,
    twt_user_id,
    twt_transaction_type,
    twt_amount,
    twt_description,
    twt_reference_type,
    twt_reference_id
  ) VALUES (
    v_wallet_id,
    p_user_id,
    p_transaction_type,
    p_amount,
    p_description,
    p_reference_type,
    p_reference_id
  ) RETURNING twt_id INTO v_transaction_id;

  RETURN json_build_object(
    'success', true,
    'wallet_id', v_wallet_id,
    'transaction_id', v_transaction_id,
    'old_balance', v_current_balance,
    'new_balance', v_new_balance
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.update_wallet_balance(uuid, numeric, text, text, text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_wallet_balance(uuid, numeric, text, text, text, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_wallet_balance(uuid, numeric, text, text, text, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.update_wallet_balance(uuid, numeric, text, text, text, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.complete_user_task(
  p_user_id uuid,
  p_task_id uuid,
  p_share_url text,
  p_platform text,
  p_screenshot_url text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task record;
  v_user_task record;
  v_reward_result json;
  v_claims jsonb;
  v_is_service_role boolean := false;
BEGIN
  v_claims := COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
  v_is_service_role := COALESCE(v_claims->>'role', '') = 'service_role';

  IF NOT v_is_service_role AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Not authorized to complete this task';
  END IF;

  IF NOT public.is_user_active_member(p_user_id) THEN
    RAISE EXCEPTION 'Account is not active/verified or registration-paid';
  END IF;

  SELECT *
  INTO v_task
  FROM public.tbl_daily_tasks
  WHERE tdt_id = p_task_id;

  IF v_task IS NULL THEN
    RAISE EXCEPTION 'Task not found';
  END IF;

  IF v_task.tdt_expires_at <= now() THEN
    RAISE EXCEPTION 'Task has expired';
  END IF;

  SELECT *
  INTO v_user_task
  FROM public.tbl_user_tasks
  WHERE tut_user_id = p_user_id
    AND tut_task_id = p_task_id;

  IF v_user_task IS NULL THEN
    RAISE EXCEPTION 'Task not assigned to user';
  END IF;

  IF v_user_task.tut_completion_status = 'completed' THEN
    RAISE EXCEPTION 'Task already completed';
  END IF;

  UPDATE public.tbl_user_tasks
  SET
    tut_completion_status = 'completed',
    tut_share_url = p_share_url,
    tut_share_platform = p_platform,
    tut_share_screenshot_url = p_screenshot_url,
    tut_completed_at = now(),
    tut_updated_at = now()
  WHERE tut_id = v_user_task.tut_id;

  INSERT INTO public.tbl_social_shares (
    tss_user_id,
    tss_task_id,
    tss_coupon_id,
    tss_platform,
    tss_share_url,
    tss_content_type,
    tss_screenshot_url,
    tss_reward_amount
  ) VALUES (
    p_user_id,
    p_task_id,
    v_task.tdt_coupon_id,
    p_platform,
    p_share_url,
    v_task.tdt_task_type,
    p_screenshot_url,
    v_task.tdt_reward_amount
  );

  SELECT public.update_wallet_balance(
    p_user_id,
    v_task.tdt_reward_amount,
    'credit',
    'Task completion reward: ' || v_task.tdt_title,
    'task_reward',
    p_task_id
  ) INTO v_reward_result;

  UPDATE public.tbl_daily_tasks
  SET tdt_completed_count = tdt_completed_count + 1
  WHERE tdt_id = p_task_id;

  UPDATE public.tbl_user_tasks
  SET tut_reward_paid = true
  WHERE tut_id = v_user_task.tut_id;

  RETURN json_build_object(
    'success', true,
    'message', 'Task completed and reward credited',
    'reward_amount', v_task.tdt_reward_amount,
    'wallet_update', v_reward_result
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.complete_user_task(uuid, uuid, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.complete_user_task(uuid, uuid, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.complete_user_task(uuid, uuid, text, text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_user_daily_tasks(p_user_id uuid)
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
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_coupon_days integer := 0;
  v_start_date date := NULL;
  v_claims jsonb;
  v_is_service_role boolean := false;
BEGIN
  v_claims := COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
  v_is_service_role := COALESCE(v_claims->>'role', '') = 'service_role';

  IF NOT v_is_service_role AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Not authorized to view these tasks';
  END IF;

  SELECT
    COALESCE(p.tsp_coupon_days, 0),
    COALESCE(s.tus_start_date::date, NULL)
  INTO v_coupon_days, v_start_date
  FROM public.tbl_user_subscriptions s
  JOIN public.tbl_subscription_plans p ON p.tsp_id = s.tus_plan_id
  WHERE s.tus_user_id = p_user_id
    AND s.tus_status = 'active'
  ORDER BY s.tus_start_date DESC
  LIMIT 1;

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
  FROM public.tbl_daily_tasks dt
  LEFT JOIN public.tbl_user_tasks ut ON dt.tdt_id = ut.tut_task_id AND ut.tut_user_id = p_user_id
  LEFT JOIN public.tbl_coupons c ON dt.tdt_coupon_id = c.tc_id
  WHERE dt.tdt_task_date = CURRENT_DATE
    AND dt.tdt_is_active = true
    AND dt.tdt_expires_at > now()
    AND (
      dt.tdt_coupon_id IS NULL
      OR (
        v_coupon_days > 0
        AND v_start_date IS NOT NULL
        AND (CURRENT_DATE - v_start_date) < v_coupon_days
      )
    )
  ORDER BY dt.tdt_created_at;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_user_daily_tasks(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_daily_tasks(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_user_daily_tasks(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_wallet_summary(p_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wallet record;
  v_today_earnings numeric(18,8);
  v_total_earnings numeric(18,8);
  v_pending_tasks integer;
  v_claims jsonb;
  v_is_service_role boolean := false;
BEGIN
  v_claims := COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
  v_is_service_role := COALESCE(v_claims->>'role', '') = 'service_role';

  IF NOT v_is_service_role AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Not authorized to view this wallet summary';
  END IF;

  SELECT *
  INTO v_wallet
  FROM public.tbl_wallets
  WHERE tw_user_id = p_user_id
    AND tw_currency = 'USDT'
  ORDER BY CASE WHEN tw_wallet_type = 'working' THEN 0 ELSE 1 END
  LIMIT 1;

  IF v_wallet IS NULL THEN
    RAISE EXCEPTION 'Wallet not found';
  END IF;

  SELECT COALESCE(SUM(twt_amount), 0)
  INTO v_today_earnings
  FROM public.tbl_wallet_transactions
  WHERE twt_user_id = p_user_id
    AND twt_transaction_type = 'credit'
    AND DATE(twt_created_at) = CURRENT_DATE;

  SELECT COALESCE(SUM(twt_amount), 0)
  INTO v_total_earnings
  FROM public.tbl_wallet_transactions
  WHERE twt_user_id = p_user_id
    AND twt_transaction_type = 'credit';

  SELECT COUNT(*)
  INTO v_pending_tasks
  FROM public.tbl_user_tasks ut
  JOIN public.tbl_daily_tasks dt ON ut.tut_task_id = dt.tdt_id
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
$$;

REVOKE EXECUTE ON FUNCTION public.get_wallet_summary(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_wallet_summary(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_wallet_summary(uuid) TO authenticated, service_role;
