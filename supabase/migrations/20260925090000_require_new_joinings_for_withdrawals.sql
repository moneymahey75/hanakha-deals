-- One distinct new direct joining unlocks withdrawals; no per-withdrawal consumption.
-- Launch rules cover all non-AutoPool wallets. Cutoff is inclusive, in India time.
BEGIN;

CREATE OR REPLACE FUNCTION public.validate_withdrawal_joining_rules()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE config jsonb; rule jsonb; category text; amount jsonb;
BEGIN
  IF NEW.tss_setting_key <> 'withdrawal_joining_rules' THEN RETURN NEW; END IF;
  config := NEW.tss_setting_value;
  IF jsonb_typeof(config) = 'string' THEN config := (config #>> '{}')::jsonb; END IF;
  IF jsonb_typeof(config) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid withdrawal joining rules'; END IF;
  FOREACH category IN ARRAY ARRAY['launch', 'autopool'] LOOP
    rule := config->category;
    IF jsonb_typeof(rule) IS DISTINCT FROM 'object'
      OR jsonb_typeof(rule->'enabled') IS DISTINCT FROM 'boolean'
      OR jsonb_typeof(rule->'required_count') IS DISTINCT FROM 'number'
      OR COALESCE(rule->>'required_count', '') !~ '^[0-9]+$'
      OR jsonb_typeof(rule->'from_date') IS DISTINCT FROM 'string'
      OR COALESCE(rule->>'from_date', '') !~ '^\d{4}-\d{2}-\d{2}$'
      OR jsonb_typeof(rule->'plan_amounts') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'Invalid % withdrawal joining rule', category;
    END IF;
    IF (rule->>'required_count')::numeric NOT BETWEEN 1 AND 100000
      OR jsonb_array_length(rule->'plan_amounts') = 0 THEN
      RAISE EXCEPTION 'Select qualifying plans and a joining count between 1 and 100000';
    END IF;
    PERFORM (rule->>'from_date')::date;
    FOR amount IN SELECT * FROM jsonb_array_elements(rule->'plan_amounts') LOOP
      IF jsonb_typeof(amount) <> 'number' THEN RAISE EXCEPTION 'Invalid qualifying plan amount'; END IF;
      IF (amount #>> '{}')::numeric <= 0 THEN RAISE EXCEPTION 'Invalid qualifying plan amount'; END IF;
      IF category = 'launch' AND (amount #>> '{}')::numeric NOT IN (50, 100, 200) THEN
        RAISE EXCEPTION 'Launch joining plans must be 50, 100 or 200 USDT';
      END IF;
      IF category = 'autopool' AND NOT EXISTS (
        SELECT 1 FROM public.tbl_subscription_plans
        WHERE tsp_product_code LIKE 'autopool\_%' ESCAPE '\' AND tsp_price = (amount #>> '{}')::numeric
      ) THEN RAISE EXCEPTION 'Unknown AutoPool joining plan'; END IF;
    END LOOP;
  END LOOP;
  NEW.tss_setting_value := config;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_validate_withdrawal_joining_rules BEFORE INSERT OR UPDATE
ON public.tbl_system_settings FOR EACH ROW EXECUTE FUNCTION public.validate_withdrawal_joining_rules();

INSERT INTO public.tbl_system_settings (tss_setting_key, tss_setting_value, tss_description)
VALUES ('withdrawal_joining_rules', '{"launch":{"enabled":true,"from_date":"2026-09-25","required_count":1,"plan_amounts":[50,100,200]},"autopool":{"enabled":true,"from_date":"2026-09-25","required_count":1,"plan_amounts":[20]}}'::jsonb,
  'New direct joining requirements for withdrawals; inclusive cutoff in Asia/Kolkata')
ON CONFLICT (tss_setting_key) DO NOTHING;

CREATE POLICY withdrawal_joining_rules_read ON public.tbl_system_settings
FOR SELECT TO authenticated USING (tss_setting_key = 'withdrawal_joining_rules');

CREATE OR REPLACE FUNCTION public.get_withdrawal_joining_status(p_user_id uuid, p_wallet_type text DEFAULT 'working')
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE config jsonb; rule jsonb; category text; cutoff timestamptz; qualified integer := 0;
  required integer; enabled boolean; eligible boolean; message text;
BEGIN
  IF COALESCE((NULLIF(current_setting('request.jwt.claims', true), '')::jsonb)->>'role', '') <> 'service_role'
    AND auth.uid() IS DISTINCT FROM p_user_id THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF p_user_id IS NULL OR p_wallet_type IS NULL OR p_wallet_type NOT IN ('working','non_working','reward','autopool') THEN
    RAISE EXCEPTION 'Invalid withdrawal user or wallet';
  END IF;
  category := CASE WHEN p_wallet_type = 'autopool' THEN 'autopool' ELSE 'launch' END;
  SELECT tss_setting_value INTO config FROM public.tbl_system_settings WHERE tss_setting_key = 'withdrawal_joining_rules';
  IF jsonb_typeof(config) = 'string' THEN config := (config #>> '{}')::jsonb; END IF;
  rule := config->category;
  IF rule IS NULL THEN RAISE EXCEPTION 'Withdrawal joining rules are not configured'; END IF;
  required := (rule->>'required_count')::integer;
  enabled := (rule->>'enabled')::boolean;
  cutoff := (rule->>'from_date')::date::timestamp AT TIME ZONE 'Asia/Kolkata';
  SELECT count(DISTINCT u.tu_id)::integer INTO qualified
  FROM public.tbl_referral_closure c
  JOIN public.tbl_users u ON u.tu_id = c.trc_descendant_user_id
  WHERE c.trc_ancestor_user_id = p_user_id AND c.trc_depth = 1
    AND u.tu_id <> p_user_id AND u.tu_created_at >= cutoff AND u.tu_created_at <= now()
    AND COALESCE(u.tu_is_active, false) AND NOT COALESCE(u.tu_is_dummy, false)
    AND COALESCE(u.tu_registration_paid, false)
    AND EXISTS (
      SELECT 1 FROM public.tbl_user_subscriptions us
      JOIN public.tbl_subscription_plans sp ON sp.tsp_id = us.tus_plan_id
      WHERE us.tus_user_id = u.tu_id
        AND us.tus_start_date >= cutoff AND us.tus_start_date <= now()
        AND us.tus_status IN ('active','upgraded','exhausted','expired')
        AND COALESCE(us.tus_payment_amount, sp.tsp_price) IN (SELECT value::numeric FROM jsonb_array_elements_text(rule->'plan_amounts'))
        AND CASE WHEN category = 'autopool' THEN
          sp.tsp_product_code LIKE 'autopool\_%' ESCAPE '\'
          AND NOT EXISTS (
            SELECT 1 FROM public.tbl_user_subscriptions prior
            JOIN public.tbl_subscription_plans pp ON pp.tsp_id = prior.tus_plan_id
            WHERE prior.tus_user_id = u.tu_id AND pp.tsp_product_code LIKE 'autopool\_%' ESCAPE '\'
              AND (prior.tus_start_date, prior.tus_id) < (us.tus_start_date, us.tus_id)
          )
        ELSE COALESCE(us.tus_plan_phase, sp.tsp_plan_phase, 'prelaunch') = 'launch'
          AND COALESCE(sp.tsp_product_code, '') NOT LIKE 'autopool\_%' ESCAPE '\'
          AND us.tus_package_kind = 'registration'
        END
    );
  eligible := NOT enabled OR qualified >= required;
  message := CASE WHEN NOT enabled THEN 'New joining requirement is disabled.'
    ELSE format('%s of %s required new direct joinings since %s (India time). Qualifying %s plans: %s USDT. %s',
      qualified, required, rule->>'from_date', category,
      (SELECT string_agg(value, ', ') FROM jsonb_array_elements_text(rule->'plan_amounts')),
      CASE WHEN eligible THEN 'Joining requirement met.' ELSE 'Joinings still needed: ' || greatest(0, required-qualified)::text || '.' END)
    END;
  RETURN jsonb_build_object('eligible', eligible, 'enabled', enabled, 'qualified_count', qualified,
    'required_count', required, 'remaining_count', greatest(0, required-qualified), 'category', category,
    'from_date', rule->>'from_date', 'plan_amounts', rule->'plan_amounts', 'message', message);
END;
$$;
REVOKE ALL ON FUNCTION public.get_withdrawal_joining_status(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_withdrawal_joining_status(uuid,text) TO authenticated, service_role;

-- Insert guard covers API, direct service inserts and both manual/automatic requests.
-- Updates are checked when processing an unpaid request; cancellation/refunds remain possible.
CREATE OR REPLACE FUNCTION public.enforce_withdrawal_joining_requirement()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE eligibility jsonb;
BEGIN
  IF TG_OP = 'INSERT' OR (
    NEW.twr_status IN ('pending','processing','approved','completed')
    AND NEW.twr_blockchain_tx IS NULL
    AND NOT EXISTS (SELECT 1 FROM public.tbl_wallet_transactions
      WHERE twt_reference_type = 'withdrawal' AND twt_reference_id = NEW.twr_id
        AND twt_transaction_type = 'debit' AND twt_status IN ('pending','completed','failed'))
  ) THEN
    eligibility := public.get_withdrawal_joining_status(NEW.twr_user_id, COALESCE(NEW.twr_wallet_type, 'working'));
    IF NOT (eligibility->>'eligible')::boolean THEN
      RAISE EXCEPTION USING MESSAGE = eligibility->>'message', ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_enforce_withdrawal_joining_requirement
BEFORE INSERT OR UPDATE OF twr_status, twr_user_id, twr_wallet_type ON public.tbl_withdrawal_requests
FOR EACH ROW EXECUTE FUNCTION public.enforce_withdrawal_joining_requirement();

-- Check again at the authoritative debit boundary, including retries and old pending requests.
CREATE OR REPLACE FUNCTION public.debit_wallet_for_withdrawal(p_withdrawal_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_joining_status jsonb; v_withdrawal record; v_wallet record; v_existing_debit record; v_existing_refund uuid;
  v_wallet_type text; v_amount numeric(18,6); v_reserved_balance numeric(18,6) := 0;
  v_pending_total numeric(18,6) := 0; v_available_balance numeric(18,6) := 0; v_transaction_id uuid;
BEGIN
  SELECT * INTO v_withdrawal FROM public.tbl_withdrawal_requests WHERE twr_id = p_withdrawal_id FOR UPDATE;
  IF v_withdrawal.twr_id IS NULL THEN RAISE EXCEPTION 'Withdrawal request not found'; END IF;
  IF v_withdrawal.twr_blockchain_tx IS NOT NULL THEN RAISE EXCEPTION 'Withdrawal already has a blockchain transaction'; END IF;
  IF COALESCE(v_withdrawal.twr_status, '') NOT IN ('pending', 'processing', 'failed') THEN RAISE EXCEPTION 'Withdrawal is not debit-eligible'; END IF;
  v_amount := round(COALESCE(v_withdrawal.twr_amount, 0), 6);
  IF v_amount <= 0 THEN RAISE EXCEPTION 'Invalid withdrawal amount'; END IF;
  v_wallet_type := CASE WHEN v_withdrawal.twr_wallet_type IN ('reward','non_working','autopool') THEN v_withdrawal.twr_wallet_type ELSE 'working' END;
  SELECT twt_id, twt_status, twt_amount INTO v_existing_debit FROM public.tbl_wallet_transactions
  WHERE twt_reference_type = 'withdrawal' AND twt_reference_id = p_withdrawal_id AND twt_transaction_type = 'debit'
    AND twt_status IN ('pending','completed','failed') ORDER BY twt_created_at DESC LIMIT 1 FOR UPDATE;
  IF v_existing_debit.twt_id IS NOT NULL THEN
    IF round(COALESCE(v_existing_debit.twt_amount, 0), 6) <> v_amount THEN RAISE EXCEPTION 'Existing withdrawal debit amount mismatch'; END IF;
    IF v_existing_debit.twt_status = 'failed' THEN UPDATE public.tbl_wallet_transactions SET twt_status = 'pending' WHERE twt_id = v_existing_debit.twt_id; END IF;
    RETURN jsonb_build_object('success', true, 'reused', true, 'wallet_transaction_id', v_existing_debit.twt_id);
  END IF;
  v_joining_status := public.get_withdrawal_joining_status(v_withdrawal.twr_user_id, v_wallet_type);
  IF NOT (v_joining_status->>'eligible')::boolean THEN
    RAISE EXCEPTION USING MESSAGE = v_joining_status->>'message', ERRCODE = 'P0001';
  END IF;
  SELECT tw_id, tw_balance, tw_reserved_balance INTO v_wallet FROM public.tbl_wallets
  WHERE tw_user_id = v_withdrawal.twr_user_id AND tw_currency = 'USDT' AND tw_wallet_type = v_wallet_type FOR UPDATE;
  IF v_wallet.tw_id IS NULL THEN RAISE EXCEPTION 'Wallet not found for withdrawal'; END IF;
  SELECT twt_id INTO v_existing_refund FROM public.tbl_wallet_transactions
  WHERE twt_reference_type = 'withdrawal' AND twt_reference_id = p_withdrawal_id AND twt_transaction_type = 'credit' AND twt_status IN ('completed','pending') LIMIT 1;
  IF v_existing_refund IS NOT NULL THEN RAISE EXCEPTION 'Withdrawal has already been refunded'; END IF;
  SELECT COALESCE(SUM(twr_amount), 0) INTO v_pending_total FROM public.tbl_withdrawal_requests
  WHERE twr_user_id = v_withdrawal.twr_user_id AND COALESCE(twr_wallet_type, 'working') = v_wallet_type AND twr_id <> p_withdrawal_id AND twr_status IN ('pending','processing','approved');
  v_reserved_balance := CASE WHEN v_wallet_type = 'working' THEN COALESCE(v_wallet.tw_reserved_balance, 0) ELSE 0 END;
  v_available_balance := COALESCE(v_wallet.tw_balance, 0) - v_reserved_balance - v_pending_total;
  IF v_available_balance < v_amount THEN RAISE EXCEPTION 'Insufficient wallet balance'; END IF;
  UPDATE public.tbl_wallets SET tw_balance = COALESCE(tw_balance, 0) - v_amount, tw_updated_at = now() WHERE tw_id = v_wallet.tw_id;
  INSERT INTO public.tbl_wallet_transactions (twt_wallet_id,twt_user_id,twt_transaction_type,twt_amount,twt_description,twt_reference_type,twt_reference_id,twt_status,twt_created_at)
  VALUES (v_wallet.tw_id,v_withdrawal.twr_user_id,'debit',v_amount,'Withdrawal approved','withdrawal',p_withdrawal_id,'pending',now()) RETURNING twt_id INTO v_transaction_id;
  RETURN jsonb_build_object('success', true, 'reused', false, 'wallet_id', v_wallet.tw_id, 'wallet_transaction_id', v_transaction_id, 'available_before', v_available_balance);
END;
$$;

REVOKE ALL ON FUNCTION public.debit_wallet_for_withdrawal(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.debit_wallet_for_withdrawal(uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
