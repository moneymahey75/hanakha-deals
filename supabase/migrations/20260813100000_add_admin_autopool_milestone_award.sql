-- Allow the admin backend to repair or manually award a single AutoPool milestone.
-- The reward row, isolated AutoPool wallet credit, and linked transaction are one
-- database transaction, so a failed request cannot leave a partial award behind.

CREATE OR REPLACE FUNCTION public.award_autopool_20_milestone(
  p_user_id uuid,
  p_level integer,
  p_amount numeric(18, 6),
  p_description text DEFAULT NULL
)
RETURNS TABLE (
  reward_id uuid,
  wallet_transaction_id uuid,
  wallet_id uuid,
  new_balance numeric(18, 6),
  required_members bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_membership public.tbl_autopool_20_memberships%ROWTYPE;
  v_reward_id uuid;
  v_wallet_id uuid;
  v_wallet_transaction_id uuid;
  v_new_balance numeric(18, 6);
  v_required_members bigint;
BEGIN
  IF p_level NOT BETWEEN 1 AND 8 THEN
    RAISE EXCEPTION 'AutoPool milestone level must be between 1 and 8';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'AutoPool milestone amount must be greater than zero';
  END IF;

  SELECT *
  INTO v_membership
  FROM public.tbl_autopool_20_memberships
  WHERE ta20_user_id = p_user_id
  FOR UPDATE;

  IF v_membership.ta20_id IS NULL THEN
    RAISE EXCEPTION 'User does not have an AutoPool membership';
  END IF;

  v_required_members := power(4, p_level)::bigint;

  INSERT INTO public.tbl_autopool_20_milestone_rewards (
    ta20mr_membership_id,
    ta20mr_level,
    ta20mr_required_members,
    ta20mr_amount
  ) VALUES (
    v_membership.ta20_id,
    p_level,
    v_required_members,
    round(p_amount, 6)
  )
  ON CONFLICT (ta20mr_membership_id, ta20mr_level) DO NOTHING
  RETURNING ta20mr_id INTO v_reward_id;

  IF v_reward_id IS NULL THEN
    RAISE EXCEPTION 'AutoPool milestone level % has already been awarded for this user', p_level;
  END IF;

  v_wallet_id := public.ensure_autopool_wallet(p_user_id);

  UPDATE public.tbl_wallets
  SET tw_balance = COALESCE(tw_balance, 0) + round(p_amount, 6),
      tw_updated_at = now()
  WHERE tw_id = v_wallet_id
  RETURNING tw_balance INTO v_new_balance;

  INSERT INTO public.tbl_wallet_transactions (
    twt_wallet_id,
    twt_user_id,
    twt_transaction_type,
    twt_amount,
    twt_currency,
    twt_description,
    twt_status,
    twt_reference_type,
    twt_reference_id
  ) VALUES (
    v_wallet_id,
    p_user_id,
    'credit',
    round(p_amount, 6),
    'USDT',
    COALESCE(NULLIF(trim(p_description), ''), 'Admin awarded 20 USDT AutoPool level ' || p_level || ' milestone'),
    'completed',
    'autopool_20_milestone',
    v_reward_id
  )
  RETURNING twt_id INTO v_wallet_transaction_id;

  UPDATE public.tbl_autopool_20_milestone_rewards
  SET ta20mr_wallet_transaction_id = v_wallet_transaction_id
  WHERE ta20mr_id = v_reward_id;

  RETURN QUERY SELECT v_reward_id, v_wallet_transaction_id, v_wallet_id, v_new_balance, v_required_members;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.award_autopool_20_milestone(uuid, integer, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.award_autopool_20_milestone(uuid, integer, numeric, text) TO service_role;

NOTIFY pgrst, 'reload schema';
