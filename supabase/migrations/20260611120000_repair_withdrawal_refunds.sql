CREATE OR REPLACE FUNCTION public.refund_withdrawal_if_debited(
  p_withdrawal_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_withdrawal record;
  v_wallet record;
  v_debit record;
  v_existing_refund uuid;
  v_refund_amount numeric;
BEGIN
  SELECT *
    INTO v_withdrawal
  FROM public.tbl_withdrawal_requests
  WHERE twr_id = p_withdrawal_id
    AND twr_status IN ('failed', 'rejected', 'pending', 'processing');

  IF v_withdrawal.twr_id IS NULL THEN
    RETURN jsonb_build_object('refunded', false, 'reason', 'withdrawal_not_found_or_not_refundable');
  END IF;

  SELECT tw_id, tw_balance
    INTO v_wallet
  FROM public.tbl_wallets
  WHERE tw_user_id = v_withdrawal.twr_user_id
    AND tw_currency = 'USDT'
    AND tw_wallet_type = COALESCE(v_withdrawal.twr_wallet_type, 'working')
  FOR UPDATE;

  IF v_wallet.tw_id IS NULL THEN
    RETURN jsonb_build_object('refunded', false, 'reason', 'wallet_not_found');
  END IF;

  SELECT twt_id
    INTO v_existing_refund
  FROM public.tbl_wallet_transactions
  WHERE twt_reference_type = 'withdrawal'
    AND twt_reference_id = p_withdrawal_id
    AND twt_transaction_type = 'credit'
    AND twt_status IN ('completed', 'pending')
  LIMIT 1;

  IF v_existing_refund IS NOT NULL THEN
    RETURN jsonb_build_object('refunded', false, 'reason', 'already_refunded');
  END IF;

  SELECT twt_id, twt_status, twt_amount
    INTO v_debit
  FROM public.tbl_wallet_transactions
  WHERE twt_reference_type = 'withdrawal'
    AND twt_reference_id = p_withdrawal_id
    AND twt_transaction_type = 'debit'
    AND twt_status IN ('pending', 'failed')
  ORDER BY twt_created_at DESC
  LIMIT 1;

  IF v_debit.twt_id IS NULL THEN
    RETURN jsonb_build_object('refunded', false, 'reason', 'no_refundable_debit');
  END IF;

  v_refund_amount := COALESCE(v_debit.twt_amount, v_withdrawal.twr_amount, 0);

  IF v_refund_amount <= 0 THEN
    RETURN jsonb_build_object('refunded', false, 'reason', 'invalid_refund_amount');
  END IF;

  UPDATE public.tbl_wallets
  SET
    tw_balance = COALESCE(tw_balance, 0) + v_refund_amount,
    tw_updated_at = now()
  WHERE tw_id = v_wallet.tw_id;

  UPDATE public.tbl_wallet_transactions
  SET twt_status = 'cancelled'
  WHERE twt_id = v_debit.twt_id;

  INSERT INTO public.tbl_wallet_transactions (
    twt_wallet_id,
    twt_user_id,
    twt_transaction_type,
    twt_amount,
    twt_description,
    twt_reference_type,
    twt_reference_id,
    twt_status,
    twt_created_at
  )
  VALUES (
    v_wallet.tw_id,
    v_withdrawal.twr_user_id,
    'credit',
    v_refund_amount,
    'Withdrawal refund repair',
    'withdrawal',
    p_withdrawal_id,
    'completed',
    now()
  );

  RETURN jsonb_build_object(
    'refunded', true,
    'amount', v_refund_amount,
    'wallet_id', v_wallet.tw_id,
    'withdrawal_id', p_withdrawal_id
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.refund_withdrawal_if_debited(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.refund_withdrawal_if_debited(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.refund_withdrawal_if_debited(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.refund_withdrawal_if_debited(uuid) TO service_role;
