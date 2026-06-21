-- Keep coupon rating responsive after users renew exhausted packages.
-- The rating RPC credits the user's own coupon first; ROI-to-ROI award work is
-- guarded so a slow upline award cannot roll back the customer's rating.

CREATE INDEX IF NOT EXISTS idx_wallet_transactions_reward_reference_completed
  ON public.tbl_wallet_transactions (twt_reference_type, twt_reference_id, twt_status, twt_transaction_type);

CREATE INDEX IF NOT EXISTS idx_wallet_transactions_wallet_reference_completed
  ON public.tbl_wallet_transactions (twt_wallet_id, twt_reference_type, twt_reference_id, twt_status);

CREATE INDEX IF NOT EXISTS idx_user_reward_coupons_user_subscription_date_status
  ON public.tbl_user_reward_coupons (turc_user_id, turc_subscription_id, turc_reward_date, turc_status);

CREATE INDEX IF NOT EXISTS idx_user_reward_coupons_subscription_status
  ON public.tbl_user_reward_coupons (turc_subscription_id, turc_status, turc_reward_date);

CREATE INDEX IF NOT EXISTS idx_joining_commissions_recipient_subscription_status
  ON public.tbl_joining_commissions (tjc_recipient_subscription_id, tjc_status)
  WHERE tjc_recipient_subscription_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_roi_level_incomes_recipient_subscription_status
  ON public.tbl_roi_level_incomes (trli_recipient_subscription_id, trli_status)
  WHERE trli_recipient_subscription_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tbl_users_referrer_id
  ON public.tbl_users (tu_referrer_id)
  WHERE tu_referrer_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.count_paid_direct_joins(p_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH parent_profile AS (
    SELECT public.normalize_sponsorship_key(tup_sponsorship_number) AS sponsorship_key
    FROM public.tbl_user_profiles
    WHERE tup_user_id = p_user_id
    LIMIT 1
  ),
  candidate_children AS (
    SELECT child.tu_id
    FROM public.tbl_users child
    WHERE child.tu_referrer_id = p_user_id

    UNION

    SELECT child_profile.tup_user_id AS tu_id
    FROM parent_profile parent
    JOIN public.tbl_user_profiles child_profile
      ON public.normalize_sponsorship_key(child_profile.tup_parent_account) = parent.sponsorship_key
    WHERE parent.sponsorship_key IS NOT NULL
  )
  SELECT COALESCE(COUNT(DISTINCT candidate.tu_id), 0)::integer
  FROM candidate_children candidate
  WHERE public.is_valid_roi_direct_customer(candidate.tu_id);
$$;

CREATE OR REPLACE FUNCTION public.rate_reward_coupon(
  p_assignment_id uuid,
  p_rating integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $rate_reward_coupon_timeout_safe$
DECLARE
  v_user_id uuid := auth.uid();
  v_assignment record;
  v_coupon record;
  v_wallet_id uuid;
  v_transaction_id uuid;
  v_existing_reward_tx_id uuid;
  v_rating integer := COALESCE(p_rating, 0);
  v_roi_level_result jsonb := '{}'::jsonb;
  v_credit_amount numeric(18, 6);
  v_exhaustion_result jsonb := '{}'::jsonb;
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
    SELECT tx.twt_id
    INTO v_existing_reward_tx_id
    FROM public.tbl_wallet_transactions tx
    WHERE tx.twt_reference_type = 'reward_coupon'
      AND tx.twt_reference_id = p_assignment_id
      AND tx.twt_status = 'completed'
    ORDER BY tx.twt_created_at ASC
    LIMIT 1;

    IF v_existing_reward_tx_id IS NOT NULL THEN
      BEGIN
        v_roi_level_result := public.award_roi_level_income_for_reward_coupon(p_assignment_id);
      EXCEPTION
        WHEN query_canceled THEN
          v_roi_level_result := jsonb_build_object('success', false, 'reason', 'roi_award_timeout');
        WHEN OTHERS THEN
          v_roi_level_result := jsonb_build_object('success', false, 'reason', 'roi_award_failed', 'message', SQLERRM);
      END;
    END IF;

    RETURN jsonb_build_object(
      'status', v_assignment.turc_status,
      'reaction', v_assignment.turc_reaction,
      'rating', v_assignment.turc_rating,
      'reacted_at', v_assignment.turc_reacted_at,
      'reward_credited', false,
      'reward_amount', v_assignment.turc_reward_amount,
      'roi_level_income', v_roi_level_result
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

  v_credit_amount := public.cap_subscription_non_working_credit(
    v_assignment.turc_subscription_id,
    v_assignment.turc_reward_amount
  );

  IF v_credit_amount <= 0 THEN
    UPDATE public.tbl_user_reward_coupons
    SET
      turc_status = v_assignment.turc_reaction,
      turc_rating = v_rating,
      turc_reward_amount = 0,
      turc_reacted_at = now()
    WHERE turc_id = p_assignment_id
    RETURNING * INTO v_assignment;

    v_exhaustion_result := public.mark_subscription_exhausted_if_needed(v_assignment.turc_subscription_id);

    RETURN jsonb_build_object(
      'status', v_assignment.turc_status,
      'reaction', v_assignment.turc_reaction,
      'rating', v_assignment.turc_rating,
      'reacted_at', v_assignment.turc_reacted_at,
      'reward_credited', false,
      'reward_amount', 0,
      'package_exhaustion', v_exhaustion_result,
      'roi_level_income', v_roi_level_result
    );
  END IF;

  SELECT * INTO v_coupon
  FROM public.tbl_coupons
  WHERE tc_id = v_assignment.turc_coupon_id;

  v_wallet_id := public.ensure_reward_wallet(v_user_id);

  PERFORM 1
  FROM public.tbl_wallets
  WHERE tw_id = v_wallet_id
  FOR UPDATE;

  UPDATE public.tbl_user_reward_coupons
  SET turc_reward_amount = v_credit_amount
  WHERE turc_id = p_assignment_id
  RETURNING * INTO v_assignment;

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
    v_credit_amount,
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
    SET
      tw_balance = COALESCE(tw_balance, 0) + v_credit_amount,
      tw_updated_at = now()
    WHERE tw_id = v_wallet_id;
  END IF;

  UPDATE public.tbl_user_reward_coupons
  SET
    turc_status = v_assignment.turc_reaction,
    turc_rating = v_rating,
    turc_reacted_at = now()
  WHERE turc_id = p_assignment_id
  RETURNING * INTO v_assignment;

  IF v_transaction_id IS NOT NULL THEN
    v_exhaustion_result := public.mark_subscription_exhausted_if_needed(v_assignment.turc_subscription_id);
    BEGIN
      v_roi_level_result := public.award_roi_level_income_for_reward_coupon(p_assignment_id);
    EXCEPTION
      WHEN query_canceled THEN
        v_roi_level_result := jsonb_build_object('success', false, 'reason', 'roi_award_timeout');
      WHEN OTHERS THEN
        v_roi_level_result := jsonb_build_object('success', false, 'reason', 'roi_award_failed', 'message', SQLERRM);
    END;
  ELSE
    SELECT tx.twt_id
    INTO v_existing_reward_tx_id
    FROM public.tbl_wallet_transactions tx
    WHERE tx.twt_reference_type = 'reward_coupon'
      AND tx.twt_reference_id = p_assignment_id
      AND tx.twt_status = 'completed'
    ORDER BY tx.twt_created_at ASC
    LIMIT 1;

    IF v_existing_reward_tx_id IS NOT NULL THEN
      v_exhaustion_result := public.mark_subscription_exhausted_if_needed(v_assignment.turc_subscription_id);
      BEGIN
        v_roi_level_result := public.award_roi_level_income_for_reward_coupon(p_assignment_id);
      EXCEPTION
        WHEN query_canceled THEN
          v_roi_level_result := jsonb_build_object('success', false, 'reason', 'roi_award_timeout');
        WHEN OTHERS THEN
          v_roi_level_result := jsonb_build_object('success', false, 'reason', 'roi_award_failed', 'message', SQLERRM);
      END;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'status', v_assignment.turc_status,
    'reaction', v_assignment.turc_reaction,
    'rating', v_assignment.turc_rating,
    'reacted_at', v_assignment.turc_reacted_at,
    'reward_credited', v_transaction_id IS NOT NULL,
    'reward_amount', v_credit_amount,
    'package_exhaustion', v_exhaustion_result,
    'roi_level_income', v_roi_level_result
  );
END;
$rate_reward_coupon_timeout_safe$;

REVOKE EXECUTE ON FUNCTION public.count_paid_direct_joins(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rate_reward_coupon(uuid, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rate_reward_coupon(uuid, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.count_paid_direct_joins(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rate_reward_coupon(uuid, integer) TO authenticated;
