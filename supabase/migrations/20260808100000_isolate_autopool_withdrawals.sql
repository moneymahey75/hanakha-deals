-- Keep AutoPool income outside working-wallet package caps and expose a separate withdrawal flow.

ALTER TABLE public.tbl_wallets DROP CONSTRAINT IF EXISTS tbl_wallets_wallet_type_check;
ALTER TABLE public.tbl_wallets ADD CONSTRAINT tbl_wallets_wallet_type_check
  CHECK (tw_wallet_type IN ('working', 'non_working', 'reward', 'autopool'));

ALTER TABLE public.tbl_withdrawal_requests DROP CONSTRAINT IF EXISTS tbl_withdrawal_requests_wallet_type_check;
ALTER TABLE public.tbl_withdrawal_requests ADD CONSTRAINT tbl_withdrawal_requests_wallet_type_check
  CHECK (twr_wallet_type IN ('working', 'non_working', 'reward', 'autopool'));

INSERT INTO public.tbl_system_settings (tss_setting_key, tss_setting_value, tss_description)
VALUES ('autopool_withdrawal_min_amount', '10', 'Minimum AutoPool income withdrawal amount in USDT')
ON CONFLICT (tss_setting_key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.ensure_autopool_wallet(p_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_wallet_id uuid;
BEGIN
  SELECT tw_id INTO v_wallet_id FROM public.tbl_wallets
  WHERE tw_user_id = p_user_id AND tw_currency = 'USDT' AND tw_wallet_type = 'autopool'
  LIMIT 1;
  IF v_wallet_id IS NULL THEN
    INSERT INTO public.tbl_wallets (tw_user_id, tw_balance, tw_reserved_balance, tw_currency, tw_wallet_type)
    VALUES (p_user_id, 0, 0, 'USDT', 'autopool')
    ON CONFLICT (tw_user_id, tw_currency, tw_wallet_type) DO NOTHING
    RETURNING tw_id INTO v_wallet_id;
    IF v_wallet_id IS NULL THEN
      SELECT tw_id INTO v_wallet_id FROM public.tbl_wallets
      WHERE tw_user_id = p_user_id AND tw_currency = 'USDT' AND tw_wallet_type = 'autopool'
      LIMIT 1;
    END IF;
  END IF;
  RETURN v_wallet_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.ensure_autopool_wallet(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_autopool_wallet(uuid) TO service_role;

DO $$
DECLARE v_tx record; v_autopool_wallet uuid;
BEGIN
  FOR v_tx IN
    SELECT tx.twt_id, tx.twt_wallet_id, tx.twt_user_id, tx.twt_amount
    FROM public.tbl_wallet_transactions tx
    WHERE tx.twt_reference_type = 'autopool_20_milestone'
      AND tx.twt_transaction_type = 'credit'
      AND tx.twt_wallet_id IS NOT NULL
  LOOP
    SELECT public.ensure_autopool_wallet(v_tx.twt_user_id) INTO v_autopool_wallet;
    IF v_tx.twt_wallet_id IS DISTINCT FROM v_autopool_wallet THEN
      UPDATE public.tbl_wallets
      SET tw_balance = COALESCE(tw_balance, 0) - v_tx.twt_amount, tw_updated_at = now()
      WHERE tw_id = v_tx.twt_wallet_id;
      UPDATE public.tbl_wallets
      SET tw_balance = COALESCE(tw_balance, 0) + v_tx.twt_amount, tw_updated_at = now()
      WHERE tw_id = v_autopool_wallet;
      UPDATE public.tbl_wallet_transactions SET twt_wallet_id = v_autopool_wallet WHERE twt_id = v_tx.twt_id;
    END IF;
  END LOOP;
END;
$$;

-- Existing memberships are retained; only future milestone credits use the isolated wallet.
CREATE OR REPLACE FUNCTION public.place_autopool_20_membership()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_position bigint; v_parent_position bigint; v_parent public.tbl_autopool_20_memberships%ROWTYPE;
  v_level integer; v_capacity bigint; v_ancestor uuid[] := '{}'; v_membership_id uuid;
  v_ancestor_id uuid; v_ancestor_level integer; v_reward_level integer; v_required bigint;
  v_amount numeric; v_wallet_id uuid; v_wallet_tx_id uuid; v_reward_id uuid;
BEGIN
  IF NOT public.is_autopool_20_plan(NEW.tus_plan_id) OR NEW.tus_status NOT IN ('active', 'upgraded') THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('autopool_20_global', 0));
  SELECT COALESCE(MAX(ta20_position) + 1, 0) INTO v_position FROM public.tbl_autopool_20_memberships;
  IF v_position = 0 THEN v_level := 0; ELSE
    v_level := 1; v_capacity := 4;
    WHILE v_position > v_capacity LOOP v_level := v_level + 1; v_capacity := v_capacity + power(4, v_level)::bigint; END LOOP;
  END IF;
  IF v_level > 8 THEN RAISE EXCEPTION 'The 20 USDT AutoPool matrix is full'; END IF;
  IF v_position > 0 THEN
    v_parent_position := floor((v_position - 1) / 4);
    SELECT * INTO v_parent FROM public.tbl_autopool_20_memberships WHERE ta20_position = v_parent_position FOR UPDATE;
    v_ancestor := v_parent.ta20_ancestor_ids || v_parent.ta20_id;
  END IF;
  INSERT INTO public.tbl_autopool_20_memberships
    (ta20_user_id, ta20_subscription_id, ta20_position, ta20_level, ta20_parent_id, ta20_ancestor_ids)
  VALUES (NEW.tus_user_id, NEW.tus_id, v_position, v_level,
    CASE WHEN v_position = 0 THEN NULL ELSE v_parent.ta20_id END, v_ancestor)
  RETURNING ta20_id INTO v_membership_id;
  FOREACH v_ancestor_id IN ARRAY v_ancestor LOOP
    SELECT ta20_level INTO v_ancestor_level FROM public.tbl_autopool_20_memberships WHERE ta20_id = v_ancestor_id;
    FOR v_reward_level IN 1..8 LOOP
      IF v_ancestor_level + v_reward_level > 8 THEN CONTINUE; END IF;
      v_required := power(4, v_reward_level)::bigint;
      IF (SELECT count(*) FROM public.tbl_autopool_20_memberships m
          WHERE v_ancestor_id = ANY(m.ta20_ancestor_ids) AND m.ta20_level = v_ancestor_level + v_reward_level) = v_required THEN
        v_amount := CASE v_reward_level WHEN 1 THEN 1 WHEN 2 THEN 8 WHEN 3 THEN 32 WHEN 4 THEN 128
          WHEN 5 THEN 512 WHEN 6 THEN 1024 WHEN 7 THEN 4096 WHEN 8 THEN 16384 END;
        INSERT INTO public.tbl_autopool_20_milestone_rewards
          (ta20mr_membership_id, ta20mr_level, ta20mr_required_members, ta20mr_amount)
        VALUES (v_ancestor_id, v_reward_level, v_required, v_amount)
        ON CONFLICT DO NOTHING RETURNING ta20mr_id INTO v_reward_id;
        IF v_reward_id IS NOT NULL THEN
          SELECT public.ensure_autopool_wallet(m.ta20_user_id) INTO v_wallet_id
          FROM public.tbl_autopool_20_memberships m WHERE m.ta20_id = v_ancestor_id;
          INSERT INTO public.tbl_wallet_transactions
            (twt_wallet_id, twt_user_id, twt_transaction_type, twt_amount, twt_currency, twt_description, twt_status, twt_reference_type, twt_reference_id)
          SELECT v_wallet_id, w.tw_user_id, 'credit', v_amount, 'USDT', '20 USDT AutoPool level ' || v_reward_level || ' milestone', 'completed', 'autopool_20_milestone', v_reward_id
          FROM public.tbl_wallets w WHERE w.tw_id = v_wallet_id RETURNING twt_id INTO v_wallet_tx_id;
          UPDATE public.tbl_wallets SET tw_balance = COALESCE(tw_balance, 0) + v_amount, tw_updated_at = now() WHERE tw_id = v_wallet_id;
          UPDATE public.tbl_autopool_20_milestone_rewards SET ta20mr_wallet_transaction_id = v_wallet_tx_id WHERE ta20mr_id = v_reward_id;
        END IF;
      END IF;
    END LOOP;
  END LOOP;
  RETURN NEW;
END;
$$;

-- Preserve the hardened withdrawal checks while recognizing the isolated wallet.
CREATE OR REPLACE FUNCTION public.debit_wallet_for_withdrawal(p_withdrawal_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_withdrawal record; v_wallet record; v_existing_debit record; v_existing_refund uuid;
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

REVOKE EXECUTE ON FUNCTION public.debit_wallet_for_withdrawal(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.debit_wallet_for_withdrawal(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.validate_withdrawal_request_integrity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_wallet record; v_connection record; v_wallet_type text; v_reserved numeric(18,6) := 0; v_pending numeric(18,6) := 0; v_available numeric(18,6) := 0;
BEGIN
  IF COALESCE((NULLIF(current_setting('request.jwt.claims', true), '')::jsonb)->>'role', '') <> 'service_role' AND auth.uid() IS DISTINCT FROM NEW.twr_user_id THEN RAISE EXCEPTION 'Not authorized to create withdrawal request'; END IF;
  NEW.twr_amount := round(COALESCE(NEW.twr_amount,0),6); NEW.twr_commission_percent := round(COALESCE(NEW.twr_commission_percent,0),3); NEW.twr_commission_amount := round(COALESCE(NEW.twr_commission_amount,0),6); NEW.twr_net_amount := round(COALESCE(NEW.twr_net_amount,0),6);
  IF NEW.twr_amount <= 0 OR NEW.twr_net_amount <= 0 OR NEW.twr_net_amount > NEW.twr_amount THEN RAISE EXCEPTION 'Invalid withdrawal amount'; END IF;
  IF NEW.twr_destination_address !~* '^0x[0-9a-f]{40}$' THEN RAISE EXCEPTION 'Invalid withdrawal destination'; END IF;
  v_wallet_type := CASE WHEN NEW.twr_wallet_type IN ('reward','non_working','autopool') THEN NEW.twr_wallet_type ELSE 'working' END; NEW.twr_wallet_type := v_wallet_type;
  IF NEW.twr_wallet_connection_id IS NOT NULL THEN
    SELECT tuwc_id,tuwc_user_id,tuwc_wallet_address,tuwc_is_active INTO v_connection FROM public.tbl_user_wallet_connections WHERE tuwc_id = NEW.twr_wallet_connection_id;
    IF v_connection.tuwc_id IS NULL OR v_connection.tuwc_user_id IS DISTINCT FROM NEW.twr_user_id OR COALESCE(v_connection.tuwc_is_active,false) IS NOT TRUE OR lower(v_connection.tuwc_wallet_address) <> lower(NEW.twr_destination_address) THEN RAISE EXCEPTION 'Withdrawal wallet does not belong to user'; END IF;
  END IF;
  IF NEW.twr_status IN ('pending','processing','approved') AND NEW.twr_blockchain_tx IS NULL THEN
    SELECT tw_id,tw_balance,tw_reserved_balance INTO v_wallet FROM public.tbl_wallets WHERE tw_user_id=NEW.twr_user_id AND tw_currency='USDT' AND tw_wallet_type=v_wallet_type FOR UPDATE;
    IF v_wallet.tw_id IS NULL THEN RAISE EXCEPTION 'Wallet not found for withdrawal'; END IF;
    SELECT COALESCE(SUM(twr_amount),0) INTO v_pending FROM public.tbl_withdrawal_requests WHERE twr_user_id=NEW.twr_user_id AND COALESCE(twr_wallet_type,'working')=v_wallet_type AND twr_id IS DISTINCT FROM NEW.twr_id AND twr_status IN ('pending','processing','approved');
    v_reserved := CASE WHEN v_wallet_type='working' THEN COALESCE(v_wallet.tw_reserved_balance,0) ELSE 0 END;
    v_available := COALESCE(v_wallet.tw_balance,0)-v_reserved-v_pending;
    IF v_available < NEW.twr_amount THEN RAISE EXCEPTION 'Insufficient wallet balance'; END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP POLICY IF EXISTS "system_settings_public_safe_select" ON public.tbl_system_settings;
CREATE POLICY "system_settings_public_safe_select" ON public.tbl_system_settings FOR SELECT TO anon, authenticated USING (
  tss_setting_key IN ('withdrawal_enabled','withdrawal_disabled_message','withdrawal_min_amount','reward_withdrawal_min_amount','autopool_withdrawal_min_amount','withdrawal_step_amount','withdrawal_commission_percent','withdrawal_auto_transfer','withdrawal_processing_days')
  OR tss_setting_key IN ('site_name','logo_url','date_format','timezone','maintenance_mode','maintenance_message','maintenance_notice_enabled','maintenance_notice_message','maintenance_window_start_at','maintenance_window_end_at','maintenance_allowed_ips','contact_email','contact_email_note','contact_phone','contact_phone_note','contact_address','contact_business_hours','contact_quick_support_links','social_facebook_url','social_twitter_url','social_linkedin_url','social_instagram_url','social_youtube_url','social_whatsapp_url','after_launch_plan_config','home_autopool_popup_enabled','launch_phase','site_mode','captcha_verification_enabled','email_verification_required','mobile_verification_required','either_verification_required','referral_mandatory','customer_email_unique','customer_mobile_unique','job_seeker_video_url','job_provider_video_url','username_min_length','username_max_length','username_allow_spaces','username_allow_special_chars','username_allowed_special_chars','username_force_lower_case','username_unique_required','username_allow_numbers','username_must_start_with_letter','password_min_length','password_max_length','password_require_uppercase','password_require_lowercase','password_require_numbers','password_require_special_chars','password_allowed_special_chars','password_prevent_common','password_prevent_sequences','password_prevent_repeats','password_max_consecutive','password_min_unique_chars')
);

NOTIFY pgrst, 'reload schema';
