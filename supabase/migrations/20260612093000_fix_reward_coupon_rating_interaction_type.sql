CREATE OR REPLACE FUNCTION public.rate_reward_coupon(
  p_assignment_id uuid,
  p_rating integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_assignment record;
  v_coupon record;
  v_wallet_id uuid;
  v_balance numeric;
  v_transaction_id uuid;
  v_rating integer := COALESCE(p_rating, 0);
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF v_rating NOT BETWEEN 1 AND 5 THEN
    RAISE EXCEPTION 'Select a rating from 1 to 5 stars';
  END IF;

  SELECT * INTO v_assignment
  FROM public.tbl_user_reward_coupons
  WHERE turc_id = p_assignment_id
    AND turc_user_id = v_user_id
  FOR UPDATE;

  IF v_assignment.turc_id IS NULL THEN
    RAISE EXCEPTION 'Coupon assignment not found';
  END IF;

  IF v_assignment.turc_status IN ('liked', 'disliked') THEN
    RETURN jsonb_build_object(
      'status', v_assignment.turc_status,
      'reaction', v_assignment.turc_reaction,
      'rating', v_assignment.turc_rating,
      'reacted_at', v_assignment.turc_reacted_at,
      'reward_credited', false,
      'reward_amount', v_assignment.turc_reward_amount
    );
  END IF;

  IF v_assignment.turc_status <> 'opened' THEN
    RAISE EXCEPTION 'Open this coupon before rating it';
  END IF;

  IF v_assignment.turc_reaction IS NULL THEN
    RAISE EXCEPTION 'Choose like or dislike before rating this coupon';
  END IF;

  IF v_assignment.turc_site_visited_at IS NULL THEN
    RAISE EXCEPTION 'Visit the coupon site before submitting a rating';
  END IF;

  IF now() < v_assignment.turc_site_visited_at + interval '5 seconds' THEN
    RAISE EXCEPTION 'Please wait 5 seconds after visiting the site';
  END IF;

  SELECT * INTO v_coupon
  FROM public.tbl_coupons
  WHERE tc_id = v_assignment.turc_coupon_id;

  SELECT tw_id, tw_balance INTO v_wallet_id, v_balance
  FROM public.tbl_wallets
  WHERE tw_user_id = v_user_id
    AND tw_currency = 'USDT'
    AND tw_wallet_type = 'reward'
  FOR UPDATE;

  IF v_wallet_id IS NULL THEN
    INSERT INTO public.tbl_wallets (tw_user_id, tw_balance, tw_currency, tw_wallet_type, tw_is_active)
    VALUES (v_user_id, 0, 'USDT', 'reward', true)
    RETURNING tw_id, tw_balance INTO v_wallet_id, v_balance;
  END IF;

  INSERT INTO public.tbl_wallet_transactions (
    twt_wallet_id,
    twt_user_id,
    twt_transaction_type,
    twt_amount,
    twt_currency,
    twt_description,
    twt_reference_type,
    twt_reference_id,
    twt_status
  )
  VALUES (
    v_wallet_id,
    v_user_id,
    'credit',
    v_assignment.turc_reward_amount,
    'USDT',
    'Daily reward coupon completed: ' || COALESCE(v_coupon.tc_title, 'Coupon'),
    'reward_coupon',
    p_assignment_id,
    'completed'
  )
  ON CONFLICT DO NOTHING
  RETURNING twt_id INTO v_transaction_id;

  IF v_transaction_id IS NOT NULL THEN
    UPDATE public.tbl_wallets
    SET tw_balance = COALESCE(tw_balance, 0) + v_assignment.turc_reward_amount
    WHERE tw_id = v_wallet_id;
  END IF;

  UPDATE public.tbl_user_reward_coupons
  SET
    turc_status = v_assignment.turc_reaction,
    turc_rating = v_rating,
    turc_reacted_at = now()
  WHERE turc_id = p_assignment_id
  RETURNING * INTO v_assignment;

  RETURN jsonb_build_object(
    'status', v_assignment.turc_status,
    'reaction', v_assignment.turc_reaction,
    'rating', v_assignment.turc_rating,
    'reacted_at', v_assignment.turc_reacted_at,
    'reward_credited', v_transaction_id IS NOT NULL,
    'reward_amount', v_assignment.turc_reward_amount
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.rate_reward_coupon(uuid, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rate_reward_coupon(uuid, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.rate_reward_coupon(uuid, integer) TO authenticated;
