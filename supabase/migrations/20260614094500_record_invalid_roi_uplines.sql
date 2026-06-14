-- Record invalid ROI uplines instead of filtering them out silently.
-- Valid parents are still the only ones credited. Invalid parents are written as
-- locked rows with skip_reason = invalid_roi_customer for debugging/audit.

CREATE OR REPLACE FUNCTION public.award_roi_level_income_for_reward_coupon(p_assignment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $award_roi_record_invalid$
DECLARE
  v_assignment record;
  v_coupon record;
  v_source_label text;
  v_level integer;
  v_recipient_id uuid;
  v_percent numeric(9, 6);
  v_required_directs integer;
  v_recipient_valid boolean;
  v_direct_count integer;
  v_max_level integer;
  v_amount numeric(18, 6);
  v_income_id uuid;
  v_existing_wallet_tx_id uuid;
  v_wallet_id uuid;
  v_wallet_tx_id uuid;
  v_credited_count integer := 0;
  v_locked_count integer := 0;
  v_skipped_count integer := 0;
  v_credited_total numeric(18, 6) := 0;
BEGIN
  SELECT
    rc.*,
    up.tup_sponsorship_number,
    up.tup_first_name,
    up.tup_last_name,
    u.tu_email
  INTO v_assignment
  FROM public.tbl_user_reward_coupons rc
  JOIN public.tbl_users u ON u.tu_id = rc.turc_user_id
  LEFT JOIN public.tbl_user_profiles up ON up.tup_user_id = rc.turc_user_id
  WHERE rc.turc_id = p_assignment_id;

  IF v_assignment.turc_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'assignment_not_found');
  END IF;

  IF COALESCE(v_assignment.turc_reward_amount, 0) <= 0 THEN
    RETURN jsonb_build_object('success', false, 'reason', 'empty_source_reward');
  END IF;

  SELECT * INTO v_coupon
  FROM public.tbl_coupons
  WHERE tc_id = v_assignment.turc_coupon_id;

  v_source_label := COALESCE(
    NULLIF(trim(v_assignment.tup_sponsorship_number), ''),
    NULLIF(trim(concat_ws(' ', v_assignment.tup_first_name, v_assignment.tup_last_name)), ''),
    NULLIF(trim(v_assignment.tu_email), ''),
    v_assignment.turc_user_id::text
  );

  FOR v_level, v_recipient_id, v_percent, v_required_directs, v_recipient_valid IN
    WITH RECURSIVE uplines AS (
      SELECT
        1 AS level,
        COALESCE(parent_profile.tup_user_id, parent_by_ref.tu_id) AS recipient_user_id,
        ARRAY[source_user.tu_id, COALESCE(parent_profile.tup_user_id, parent_by_ref.tu_id)]::uuid[] AS path
      FROM public.tbl_users source_user
      LEFT JOIN public.tbl_user_profiles source_profile ON source_profile.tup_user_id = source_user.tu_id
      LEFT JOIN public.tbl_users parent_by_ref ON parent_by_ref.tu_id = source_user.tu_referrer_id
      LEFT JOIN public.tbl_user_profiles parent_profile
        ON public.normalize_sponsorship_key(parent_profile.tup_sponsorship_number)
         = public.normalize_sponsorship_key(source_profile.tup_parent_account)
      WHERE source_user.tu_id = v_assignment.turc_user_id
        AND COALESCE(parent_profile.tup_user_id, parent_by_ref.tu_id) IS NOT NULL

      UNION ALL

      SELECT
        u.level + 1,
        COALESCE(parent_profile.tup_user_id, parent_by_ref.tu_id),
        u.path || COALESCE(parent_profile.tup_user_id, parent_by_ref.tu_id)
      FROM uplines u
      JOIN public.tbl_users upline_user ON upline_user.tu_id = u.recipient_user_id
      LEFT JOIN public.tbl_user_profiles upline_profile ON upline_profile.tup_user_id = upline_user.tu_id
      LEFT JOIN public.tbl_users parent_by_ref ON parent_by_ref.tu_id = upline_user.tu_referrer_id
      LEFT JOIN public.tbl_user_profiles parent_profile
        ON public.normalize_sponsorship_key(parent_profile.tup_sponsorship_number)
         = public.normalize_sponsorship_key(upline_profile.tup_parent_account)
      WHERE u.level < 15
        AND COALESCE(parent_profile.tup_user_id, parent_by_ref.tu_id) IS NOT NULL
        AND COALESCE(parent_profile.tup_user_id, parent_by_ref.tu_id) <> ALL(u.path)
    ),
    deduped_uplines AS (
      SELECT DISTINCT ON (recipient_user_id)
        level,
        recipient_user_id
      FROM uplines
      ORDER BY recipient_user_id, level
    )
    SELECT
      u.level,
      u.recipient_user_id,
      CASE
        WHEN u.level = 1 THEN 10
        WHEN u.level = 2 THEN 5
        WHEN u.level = 3 THEN 3
        WHEN u.level = 4 THEN 2
        WHEN u.level BETWEEN 5 AND 9 THEN 1
        WHEN u.level = 10 THEN 2
        WHEN u.level IN (11, 12) THEN 1
        WHEN u.level BETWEEN 13 AND 15 THEN 2
      END::numeric(9, 6) AS percent,
      LEAST(u.level, 9)::integer AS required_directs,
      public.is_valid_roi_active_customer(u.recipient_user_id) AS recipient_valid
    FROM deduped_uplines u
    WHERE u.recipient_user_id <> v_assignment.turc_user_id
    ORDER BY u.level
  LOOP
    v_income_id := NULL;
    v_existing_wallet_tx_id := NULL;
    v_wallet_tx_id := NULL;
    v_direct_count := public.count_paid_direct_joins(v_recipient_id);
    v_max_level := public.get_user_roi_level_cap(v_recipient_id);
    v_amount := ROUND((v_assignment.turc_reward_amount * v_percent / 100)::numeric, 6);

    IF COALESCE(v_recipient_valid, false) = false THEN
      INSERT INTO public.tbl_roi_level_incomes (
        trli_assignment_id,
        trli_source_user_id,
        trli_recipient_user_id,
        trli_level,
        trli_source_reward_amount,
        trli_percentage,
        trli_income_amount,
        trli_required_directs,
        trli_directs_at_award,
        trli_max_eligible_level,
        trli_status,
        trli_skip_reason
      ) VALUES (
        p_assignment_id,
        v_assignment.turc_user_id,
        v_recipient_id,
        v_level,
        v_assignment.turc_reward_amount,
        v_percent,
        v_amount,
        v_required_directs,
        v_direct_count,
        v_max_level,
        'locked',
        'invalid_roi_customer'
      )
      ON CONFLICT (trli_assignment_id, trli_level, trli_recipient_user_id) DO UPDATE
      SET
        trli_source_reward_amount = EXCLUDED.trli_source_reward_amount,
        trli_percentage = EXCLUDED.trli_percentage,
        trli_income_amount = EXCLUDED.trli_income_amount,
        trli_required_directs = EXCLUDED.trli_required_directs,
        trli_directs_at_award = EXCLUDED.trli_directs_at_award,
        trli_max_eligible_level = EXCLUDED.trli_max_eligible_level,
        trli_status = EXCLUDED.trli_status,
        trli_skip_reason = EXCLUDED.trli_skip_reason
      WHERE public.tbl_roi_level_incomes.trli_status <> 'credited';

      v_locked_count := v_locked_count + 1;
      CONTINUE;
    END IF;

    IF v_amount <= 0 THEN
      INSERT INTO public.tbl_roi_level_incomes (
        trli_assignment_id,
        trli_source_user_id,
        trli_recipient_user_id,
        trli_level,
        trli_source_reward_amount,
        trli_percentage,
        trli_income_amount,
        trli_required_directs,
        trli_directs_at_award,
        trli_max_eligible_level,
        trli_status,
        trli_skip_reason
      ) VALUES (
        p_assignment_id,
        v_assignment.turc_user_id,
        v_recipient_id,
        v_level,
        v_assignment.turc_reward_amount,
        v_percent,
        0,
        v_required_directs,
        v_direct_count,
        v_max_level,
        'skipped',
        'zero_income_amount'
      )
      ON CONFLICT (trli_assignment_id, trli_level, trli_recipient_user_id) DO NOTHING;

      v_skipped_count := v_skipped_count + 1;
      CONTINUE;
    END IF;

    IF v_max_level < v_level THEN
      INSERT INTO public.tbl_roi_level_incomes (
        trli_assignment_id,
        trli_source_user_id,
        trli_recipient_user_id,
        trli_level,
        trli_source_reward_amount,
        trli_percentage,
        trli_income_amount,
        trli_required_directs,
        trli_directs_at_award,
        trli_max_eligible_level,
        trli_status,
        trli_skip_reason
      ) VALUES (
        p_assignment_id,
        v_assignment.turc_user_id,
        v_recipient_id,
        v_level,
        v_assignment.turc_reward_amount,
        v_percent,
        v_amount,
        v_required_directs,
        v_direct_count,
        v_max_level,
        'locked',
        'plan_level_cap_not_met'
      )
      ON CONFLICT (trli_assignment_id, trli_level, trli_recipient_user_id) DO UPDATE
      SET
        trli_source_reward_amount = EXCLUDED.trli_source_reward_amount,
        trli_percentage = EXCLUDED.trli_percentage,
        trli_income_amount = EXCLUDED.trli_income_amount,
        trli_required_directs = EXCLUDED.trli_required_directs,
        trli_directs_at_award = EXCLUDED.trli_directs_at_award,
        trli_max_eligible_level = EXCLUDED.trli_max_eligible_level,
        trli_status = EXCLUDED.trli_status,
        trli_skip_reason = EXCLUDED.trli_skip_reason
      WHERE public.tbl_roi_level_incomes.trli_status <> 'credited';

      v_locked_count := v_locked_count + 1;
      CONTINUE;
    END IF;

    IF v_direct_count < v_required_directs THEN
      INSERT INTO public.tbl_roi_level_incomes (
        trli_assignment_id,
        trli_source_user_id,
        trli_recipient_user_id,
        trli_level,
        trli_source_reward_amount,
        trli_percentage,
        trli_income_amount,
        trli_required_directs,
        trli_directs_at_award,
        trli_max_eligible_level,
        trli_status,
        trli_skip_reason
      ) VALUES (
        p_assignment_id,
        v_assignment.turc_user_id,
        v_recipient_id,
        v_level,
        v_assignment.turc_reward_amount,
        v_percent,
        v_amount,
        v_required_directs,
        v_direct_count,
        v_max_level,
        'locked',
        'direct_join_requirement_not_met'
      )
      ON CONFLICT (trli_assignment_id, trli_level, trli_recipient_user_id) DO UPDATE
      SET
        trli_source_reward_amount = EXCLUDED.trli_source_reward_amount,
        trli_percentage = EXCLUDED.trli_percentage,
        trli_income_amount = EXCLUDED.trli_income_amount,
        trli_required_directs = EXCLUDED.trli_required_directs,
        trli_directs_at_award = EXCLUDED.trli_directs_at_award,
        trli_max_eligible_level = EXCLUDED.trli_max_eligible_level,
        trli_status = EXCLUDED.trli_status,
        trli_skip_reason = EXCLUDED.trli_skip_reason
      WHERE public.tbl_roi_level_incomes.trli_status <> 'credited';

      v_locked_count := v_locked_count + 1;
      CONTINUE;
    END IF;

    INSERT INTO public.tbl_roi_level_incomes (
      trli_assignment_id,
      trli_source_user_id,
      trli_recipient_user_id,
      trli_level,
      trli_source_reward_amount,
      trli_percentage,
      trli_income_amount,
      trli_required_directs,
      trli_directs_at_award,
      trli_max_eligible_level,
      trli_status,
      trli_skip_reason
    ) VALUES (
      p_assignment_id,
      v_assignment.turc_user_id,
      v_recipient_id,
      v_level,
      v_assignment.turc_reward_amount,
      v_percent,
      v_amount,
      v_required_directs,
      v_direct_count,
      v_max_level,
      'credited',
      NULL
    )
    ON CONFLICT (trli_assignment_id, trli_level, trli_recipient_user_id) DO UPDATE
    SET
      trli_source_reward_amount = EXCLUDED.trli_source_reward_amount,
      trli_percentage = EXCLUDED.trli_percentage,
      trli_income_amount = EXCLUDED.trli_income_amount,
      trli_required_directs = EXCLUDED.trli_required_directs,
      trli_directs_at_award = EXCLUDED.trli_directs_at_award,
      trli_max_eligible_level = EXCLUDED.trli_max_eligible_level,
      trli_status = 'credited',
      trli_skip_reason = NULL
    WHERE public.tbl_roi_level_incomes.trli_status <> 'credited'
       OR public.tbl_roi_level_incomes.trli_wallet_transaction_id IS NULL
    RETURNING trli_id, trli_wallet_transaction_id
      INTO v_income_id, v_existing_wallet_tx_id;

    IF v_income_id IS NULL OR v_existing_wallet_tx_id IS NOT NULL THEN
      CONTINUE;
    END IF;

    v_wallet_id := public.ensure_reward_wallet(v_recipient_id);

    INSERT INTO public.tbl_wallet_transactions (
      twt_wallet_id,
      twt_user_id,
      twt_transaction_type,
      twt_amount,
      twt_currency,
      twt_description,
      twt_status,
      twt_reference_type,
      twt_reference_id,
      twt_created_at
    ) VALUES (
      v_wallet_id,
      v_recipient_id,
      'credit',
      v_amount,
      'USDT',
      'Level ' || v_level || ' ROI income from ' || v_source_label || ': ' || COALESCE(v_coupon.tc_title, 'Coupon'),
      'completed',
      'roi_level_income',
      v_income_id,
      now()
    )
    RETURNING twt_id INTO v_wallet_tx_id;

    UPDATE public.tbl_wallets
    SET
      tw_balance = COALESCE(tw_balance, 0) + v_amount,
      tw_updated_at = now()
    WHERE tw_id = v_wallet_id;

    UPDATE public.tbl_roi_level_incomes
    SET trli_wallet_transaction_id = v_wallet_tx_id
    WHERE trli_id = v_income_id;

    v_credited_count := v_credited_count + 1;
    v_credited_total := v_credited_total + v_amount;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'assignment_id', p_assignment_id,
    'credited_count', v_credited_count,
    'locked_count', v_locked_count,
    'skipped_count', v_skipped_count,
    'credited_total', v_credited_total
  );
END;
$award_roi_record_invalid$;

REVOKE EXECUTE ON FUNCTION public.award_roi_level_income_for_reward_coupon(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.award_roi_level_income_for_reward_coupon(uuid) TO service_role;
