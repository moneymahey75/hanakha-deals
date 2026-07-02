-- Harden withdrawal wallet debits/refunds so browser or concurrent requests cannot
-- overdraw balances or double-process a withdrawal.

CREATE OR REPLACE FUNCTION public.debit_wallet_for_withdrawal(
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
  v_existing_debit record;
  v_existing_refund uuid;
  v_wallet_type text;
  v_amount numeric(18,6);
  v_reserved_balance numeric(18,6) := 0;
  v_pending_total numeric(18,6) := 0;
  v_available_balance numeric(18,6) := 0;
  v_transaction_id uuid;
BEGIN
  SELECT *
    INTO v_withdrawal
  FROM public.tbl_withdrawal_requests
  WHERE twr_id = p_withdrawal_id
  FOR UPDATE;

  IF v_withdrawal.twr_id IS NULL THEN
    RAISE EXCEPTION 'Withdrawal request not found';
  END IF;

  IF v_withdrawal.twr_blockchain_tx IS NOT NULL THEN
    RAISE EXCEPTION 'Withdrawal already has a blockchain transaction';
  END IF;

  IF COALESCE(v_withdrawal.twr_status, '') NOT IN ('pending', 'processing', 'failed') THEN
    RAISE EXCEPTION 'Withdrawal is not debit-eligible';
  END IF;

  v_amount := round(COALESCE(v_withdrawal.twr_amount, 0), 6);
  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'Invalid withdrawal amount';
  END IF;

  v_wallet_type := CASE
    WHEN v_withdrawal.twr_wallet_type = 'reward' THEN 'reward'
    WHEN v_withdrawal.twr_wallet_type = 'non_working' THEN 'non_working'
    ELSE 'working'
  END;

  SELECT twt_id, twt_status, twt_amount
    INTO v_existing_debit
  FROM public.tbl_wallet_transactions
  WHERE twt_reference_type = 'withdrawal'
    AND twt_reference_id = p_withdrawal_id
    AND twt_transaction_type = 'debit'
    AND twt_status IN ('pending', 'completed', 'failed')
  ORDER BY twt_created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_existing_debit.twt_id IS NOT NULL THEN
    IF round(COALESCE(v_existing_debit.twt_amount, 0), 6) <> v_amount THEN
      RAISE EXCEPTION 'Existing withdrawal debit amount mismatch';
    END IF;

    IF v_existing_debit.twt_status = 'failed' THEN
      UPDATE public.tbl_wallet_transactions
      SET twt_status = 'pending'
      WHERE twt_id = v_existing_debit.twt_id;
    END IF;

    RETURN jsonb_build_object(
      'success', true,
      'reused', true,
      'wallet_transaction_id', v_existing_debit.twt_id
    );
  END IF;

  SELECT tw_id, tw_balance, tw_reserved_balance
    INTO v_wallet
  FROM public.tbl_wallets
  WHERE tw_user_id = v_withdrawal.twr_user_id
    AND tw_currency = 'USDT'
    AND tw_wallet_type = v_wallet_type
  FOR UPDATE;

  IF v_wallet.tw_id IS NULL THEN
    RAISE EXCEPTION 'Wallet not found for withdrawal';
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
    RAISE EXCEPTION 'Withdrawal has already been refunded';
  END IF;

  SELECT COALESCE(SUM(twr_amount), 0)
    INTO v_pending_total
  FROM public.tbl_withdrawal_requests
  WHERE twr_user_id = v_withdrawal.twr_user_id
    AND COALESCE(twr_wallet_type, 'working') = v_wallet_type
    AND twr_id <> p_withdrawal_id
    AND twr_status IN ('pending', 'processing', 'approved');

  v_reserved_balance := CASE
    WHEN v_wallet_type = 'working' THEN COALESCE(v_wallet.tw_reserved_balance, 0)
    ELSE 0
  END;

  v_available_balance := COALESCE(v_wallet.tw_balance, 0) - v_reserved_balance - v_pending_total;
  IF v_available_balance < v_amount THEN
    RAISE EXCEPTION 'Insufficient wallet balance';
  END IF;

  UPDATE public.tbl_wallets
  SET
    tw_balance = COALESCE(tw_balance, 0) - v_amount,
    tw_updated_at = now()
  WHERE tw_id = v_wallet.tw_id;

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
    'debit',
    v_amount,
    'Withdrawal approved',
    'withdrawal',
    p_withdrawal_id,
    'pending',
    now()
  )
  RETURNING twt_id INTO v_transaction_id;

  RETURN jsonb_build_object(
    'success', true,
    'reused', false,
    'wallet_id', v_wallet.tw_id,
    'wallet_transaction_id', v_transaction_id,
    'available_before', v_available_balance
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.debit_wallet_for_withdrawal(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.debit_wallet_for_withdrawal(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.debit_wallet_for_withdrawal(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.debit_wallet_for_withdrawal(uuid) TO service_role;

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
    AND twr_status IN ('failed', 'rejected', 'pending', 'processing')
  FOR UPDATE;

  IF v_withdrawal.twr_id IS NULL THEN
    RETURN jsonb_build_object('refunded', false, 'reason', 'withdrawal_not_found_or_not_refundable');
  END IF;

  IF v_withdrawal.twr_blockchain_tx IS NOT NULL THEN
    RETURN jsonb_build_object('refunded', false, 'reason', 'withdrawal_has_blockchain_tx');
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
  LIMIT 1
  FOR UPDATE;

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
    'Withdrawal reverted by admin',
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

CREATE INDEX IF NOT EXISTS idx_withdrawals_user_wallet_status
  ON public.tbl_withdrawal_requests (twr_user_id, twr_wallet_type, twr_status);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.tbl_wallet_transactions
    WHERE twt_reference_type = 'withdrawal'
      AND twt_transaction_type = 'debit'
      AND twt_status IN ('pending', 'completed', 'failed')
    GROUP BY twt_reference_id
    HAVING COUNT(*) > 1
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_tx_one_active_withdrawal_debit
      ON public.tbl_wallet_transactions (twt_reference_id)
      WHERE twt_reference_type = 'withdrawal'
        AND twt_transaction_type = 'debit'
        AND twt_status IN ('pending', 'completed', 'failed');
  ELSE
    CREATE INDEX IF NOT EXISTS idx_wallet_tx_active_withdrawal_debit
      ON public.tbl_wallet_transactions (twt_reference_id)
      WHERE twt_reference_type = 'withdrawal'
        AND twt_transaction_type = 'debit'
        AND twt_status IN ('pending', 'completed', 'failed');
  END IF;
END $$;

REVOKE INSERT, UPDATE, DELETE ON TABLE public.tbl_withdrawal_requests FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.tbl_withdrawal_requests FROM authenticated;
GRANT ALL ON TABLE public.tbl_withdrawal_requests TO service_role;

DROP POLICY IF EXISTS "user_insert_own" ON public.tbl_withdrawal_requests;
DROP POLICY IF EXISTS "sub_admin_update" ON public.tbl_withdrawal_requests;

CREATE OR REPLACE FUNCTION public.validate_withdrawal_request_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wallet record;
  v_wallet_connection record;
  v_wallet_type text;
  v_reserved_balance numeric(18,6) := 0;
  v_pending_total numeric(18,6) := 0;
  v_available_balance numeric(18,6) := 0;
  v_claims jsonb;
  v_is_service_role boolean := false;
BEGIN
  v_claims := COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
  v_is_service_role := COALESCE(v_claims->>'role', '') = 'service_role';

  IF NOT v_is_service_role AND auth.uid() IS DISTINCT FROM NEW.twr_user_id THEN
    RAISE EXCEPTION 'Not authorized to create withdrawal request';
  END IF;

  NEW.twr_amount := round(COALESCE(NEW.twr_amount, 0), 6);
  NEW.twr_commission_percent := round(COALESCE(NEW.twr_commission_percent, 0), 3);
  NEW.twr_commission_amount := round(COALESCE(NEW.twr_commission_amount, 0), 6);
  NEW.twr_net_amount := round(COALESCE(NEW.twr_net_amount, 0), 6);

  IF NEW.twr_amount <= 0 THEN
    RAISE EXCEPTION 'Invalid withdrawal amount';
  END IF;

  IF NEW.twr_commission_percent < 0 OR NEW.twr_commission_amount < 0 THEN
    RAISE EXCEPTION 'Invalid withdrawal commission';
  END IF;

  IF NEW.twr_net_amount <= 0 OR NEW.twr_net_amount > NEW.twr_amount THEN
    RAISE EXCEPTION 'Invalid withdrawal net amount';
  END IF;

  IF NEW.twr_destination_address !~* '^0x[0-9a-f]{40}$' THEN
    RAISE EXCEPTION 'Invalid withdrawal destination';
  END IF;

  v_wallet_type := CASE
    WHEN NEW.twr_wallet_type = 'reward' THEN 'reward'
    WHEN NEW.twr_wallet_type = 'non_working' THEN 'non_working'
    ELSE 'working'
  END;
  NEW.twr_wallet_type := v_wallet_type;

  IF NEW.twr_wallet_connection_id IS NOT NULL THEN
    SELECT tuwc_id, tuwc_user_id, tuwc_wallet_address, tuwc_is_active
      INTO v_wallet_connection
    FROM public.tbl_user_wallet_connections
    WHERE tuwc_id = NEW.twr_wallet_connection_id;

    IF v_wallet_connection.tuwc_id IS NULL
      OR v_wallet_connection.tuwc_user_id IS DISTINCT FROM NEW.twr_user_id
      OR COALESCE(v_wallet_connection.tuwc_is_active, false) IS NOT TRUE
      OR lower(v_wallet_connection.tuwc_wallet_address) <> lower(NEW.twr_destination_address)
    THEN
      RAISE EXCEPTION 'Withdrawal wallet does not belong to user';
    END IF;
  END IF;

  IF NEW.twr_status IN ('pending', 'processing', 'approved') AND NEW.twr_blockchain_tx IS NULL THEN
    SELECT tw_id, tw_balance, tw_reserved_balance
      INTO v_wallet
    FROM public.tbl_wallets
    WHERE tw_user_id = NEW.twr_user_id
      AND tw_currency = 'USDT'
      AND tw_wallet_type = v_wallet_type
    FOR UPDATE;

    IF v_wallet.tw_id IS NULL THEN
      RAISE EXCEPTION 'Wallet not found for withdrawal';
    END IF;

    SELECT COALESCE(SUM(twr_amount), 0)
      INTO v_pending_total
    FROM public.tbl_withdrawal_requests
    WHERE twr_user_id = NEW.twr_user_id
      AND COALESCE(twr_wallet_type, 'working') = v_wallet_type
      AND twr_id IS DISTINCT FROM NEW.twr_id
      AND twr_status IN ('pending', 'processing', 'approved');

    v_reserved_balance := CASE
      WHEN v_wallet_type = 'working' THEN COALESCE(v_wallet.tw_reserved_balance, 0)
      ELSE 0
    END;

    v_available_balance := COALESCE(v_wallet.tw_balance, 0) - v_reserved_balance - v_pending_total;
    IF v_available_balance < NEW.twr_amount THEN
      RAISE EXCEPTION 'Insufficient wallet balance';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_withdrawal_request_integrity ON public.tbl_withdrawal_requests;
CREATE TRIGGER trg_validate_withdrawal_request_integrity
  BEFORE INSERT OR UPDATE OF
    twr_user_id,
    twr_wallet_connection_id,
    twr_destination_address,
    twr_amount,
    twr_commission_percent,
    twr_commission_amount,
    twr_net_amount,
    twr_status,
    twr_wallet_type,
    twr_blockchain_tx
  ON public.tbl_withdrawal_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_withdrawal_request_integrity();
