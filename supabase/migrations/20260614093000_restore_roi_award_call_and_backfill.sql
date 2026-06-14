-- Ensure reward coupon rating always triggers ROI-to-ROI payout.
-- Some environments may still have the pre-ROI rate_reward_coupon definition
-- active, which credits the source coupon reward but never calls
-- award_roi_level_income_for_reward_coupon.

CREATE OR REPLACE FUNCTION public.rate_reward_coupon(
  p_assignment_id uuid,
  p_rating integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $rate_reward_coupon_roi$
DECLARE
  v_user_id uuid := auth.uid();
  v_assignment record;
  v_coupon record;
  v_wallet_id uuid;
  v_transaction_id uuid;
  v_existing_reward_tx_id uuid;
  v_rating integer := COALESCE(p_rating, 0);
  v_roi_level_result jsonb := '{}'::jsonb;
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
      v_roi_level_result := public.award_roi_level_income_for_reward_coupon(p_assignment_id);
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

  SELECT * INTO v_coupon
  FROM public.tbl_coupons
  WHERE tc_id = v_assignment.turc_coupon_id;

  v_wallet_id := public.ensure_reward_wallet(v_user_id);

  PERFORM 1
  FROM public.tbl_wallets
  WHERE tw_id = v_wallet_id
  FOR UPDATE;

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
    SET
      tw_balance = COALESCE(tw_balance, 0) + v_assignment.turc_reward_amount,
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
    v_roi_level_result := public.award_roi_level_income_for_reward_coupon(p_assignment_id);
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
      v_roi_level_result := public.award_roi_level_income_for_reward_coupon(p_assignment_id);
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'status', v_assignment.turc_status,
    'reaction', v_assignment.turc_reaction,
    'rating', v_assignment.turc_rating,
    'reacted_at', v_assignment.turc_reacted_at,
    'reward_credited', v_transaction_id IS NOT NULL,
    'reward_amount', v_assignment.turc_reward_amount,
    'roi_level_income', v_roi_level_result
  );
END;
$rate_reward_coupon_roi$;

REVOKE EXECUTE ON FUNCTION public.rate_reward_coupon(uuid, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rate_reward_coupon(uuid, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.rate_reward_coupon(uuid, integer) TO authenticated;

DO $restore_roi_backfill$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT DISTINCT rc.turc_id
    FROM public.tbl_user_reward_coupons rc
    JOIN public.tbl_wallet_transactions tx
      ON tx.twt_reference_type = 'reward_coupon'
     AND tx.twt_reference_id = rc.turc_id
     AND tx.twt_status = 'completed'
    WHERE rc.turc_status IN ('liked', 'disliked')
  LOOP
    PERFORM public.award_roi_level_income_for_reward_coupon(r.turc_id);
  END LOOP;
END;
$restore_roi_backfill$;
