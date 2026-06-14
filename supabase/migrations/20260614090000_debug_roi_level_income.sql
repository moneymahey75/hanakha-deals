-- ROI-to-ROI diagnostics.
-- This function does not credit wallets. It explains why each upline would be
-- credited, locked, or skipped for a reward coupon assignment.

CREATE OR REPLACE FUNCTION public.debug_roi_level_income_for_reward_coupon(p_assignment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $roi_level_debug$
DECLARE
  v_assignment record;
  v_reward_tx_count integer := 0;
  v_roi_income_count integer := 0;
  v_upline_count integer := 0;
  v_uplines jsonb := '[]'::jsonb;
BEGIN
  SELECT
    rc.turc_id,
    rc.turc_user_id,
    rc.turc_coupon_id,
    rc.turc_status,
    rc.turc_reaction,
    rc.turc_rating,
    rc.turc_reward_amount,
    rc.turc_site_visited_at,
    rc.turc_reacted_at,
    u.tu_email,
    u.tu_referrer_id,
    up.tup_sponsorship_number,
    up.tup_parent_account,
    up.tup_first_name,
    up.tup_last_name,
    c.tc_title
  INTO v_assignment
  FROM public.tbl_user_reward_coupons rc
  JOIN public.tbl_users u ON u.tu_id = rc.turc_user_id
  LEFT JOIN public.tbl_user_profiles up ON up.tup_user_id = rc.turc_user_id
  LEFT JOIN public.tbl_coupons c ON c.tc_id = rc.turc_coupon_id
  WHERE rc.turc_id = p_assignment_id;

  IF v_assignment.turc_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'reason', 'assignment_not_found',
      'assignment_id', p_assignment_id
    );
  END IF;

  SELECT COUNT(*)::integer
  INTO v_reward_tx_count
  FROM public.tbl_wallet_transactions tx
  WHERE tx.twt_reference_type = 'reward_coupon'
    AND tx.twt_reference_id = p_assignment_id
    AND tx.twt_status = 'completed';

  SELECT COUNT(*)::integer
  INTO v_roi_income_count
  FROM public.tbl_roi_level_incomes income
  WHERE income.trli_assignment_id = p_assignment_id;

  WITH RECURSIVE uplines AS (
    SELECT
      1 AS level,
      source_user.tu_id AS child_user_id,
      source_user.tu_referrer_id AS child_referrer_id,
      public.normalize_sponsorship_key(source_profile.tup_parent_account) AS child_parent_key,
      parent_by_ref.tu_id AS parent_by_ref_id,
      parent_profile.tup_user_id AS parent_by_profile_id,
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
      upline_user.tu_id,
      upline_user.tu_referrer_id,
      public.normalize_sponsorship_key(upline_profile.tup_parent_account),
      parent_by_ref.tu_id,
      parent_profile.tup_user_id,
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
      *
    FROM uplines
    ORDER BY recipient_user_id, level
  ),
  diagnosed AS (
    SELECT
      u.level,
      u.child_user_id,
      u.child_referrer_id,
      u.child_parent_key,
      u.parent_by_ref_id,
      u.parent_by_profile_id,
      CASE
        WHEN u.parent_by_profile_id IS NOT NULL THEN 'profile_parent_account'
        WHEN u.parent_by_ref_id IS NOT NULL THEN 'tu_referrer_id'
        ELSE 'none'
      END AS parent_lookup_used,
      u.recipient_user_id,
      recipient.tu_email AS recipient_email,
      recipient.tu_user_type AS recipient_user_type,
      COALESCE(recipient.tu_is_active, false) AS recipient_is_active,
      COALESCE(recipient.tu_registration_paid, false) AS recipient_registration_paid,
      COALESCE(recipient.tu_email_verified, false) AS recipient_email_verified,
      COALESCE(recipient.tu_mobile_verified, false) AS recipient_mobile_verified,
      public.meets_current_verification_requirements(
        recipient.tu_email_verified,
        recipient.tu_mobile_verified
      ) AS recipient_contact_verified,
      EXISTS (
        SELECT 1
        FROM public.tbl_user_subscriptions us
        JOIN public.tbl_subscription_plans sp ON sp.tsp_id = us.tus_plan_id
        WHERE us.tus_user_id = u.recipient_user_id
          AND us.tus_status IN ('active', 'upgraded')
          AND (us.tus_end_date IS NULL OR us.tus_end_date > now())
          AND COALESCE(us.tus_plan_phase, sp.tsp_plan_phase, 'prelaunch') = 'launch'
      ) AS recipient_has_launch_subscription,
      public.is_valid_roi_active_customer(u.recipient_user_id) AS recipient_is_valid_roi_customer,
      public.count_paid_direct_joins(u.recipient_user_id) AS valid_direct_count,
      public.get_user_roi_level_cap(u.recipient_user_id) AS max_eligible_level,
      CASE
        WHEN u.level = 1 THEN 10
        WHEN u.level = 2 THEN 5
        WHEN u.level = 3 THEN 3
        WHEN u.level = 4 THEN 2
        WHEN u.level BETWEEN 5 AND 9 THEN 1
        WHEN u.level = 10 THEN 2
        WHEN u.level IN (11, 12) THEN 1
        WHEN u.level BETWEEN 13 AND 15 THEN 2
      END::numeric(9, 6) AS percentage,
      LEAST(u.level, 9)::integer AS required_directs,
      ROUND((COALESCE(v_assignment.turc_reward_amount, 0) * (
        CASE
          WHEN u.level = 1 THEN 10
          WHEN u.level = 2 THEN 5
          WHEN u.level = 3 THEN 3
          WHEN u.level = 4 THEN 2
          WHEN u.level BETWEEN 5 AND 9 THEN 1
          WHEN u.level = 10 THEN 2
          WHEN u.level IN (11, 12) THEN 1
          WHEN u.level BETWEEN 13 AND 15 THEN 2
        END
      ) / 100)::numeric, 6) AS expected_income_amount,
      income.trli_status AS existing_income_status,
      income.trli_skip_reason AS existing_skip_reason,
      income.trli_wallet_transaction_id AS existing_wallet_transaction_id,
      tx.twt_status AS existing_wallet_transaction_status
    FROM deduped_uplines u
    JOIN public.tbl_users recipient ON recipient.tu_id = u.recipient_user_id
    LEFT JOIN public.tbl_roi_level_incomes income
      ON income.trli_assignment_id = p_assignment_id
     AND income.trli_level = u.level
     AND income.trli_recipient_user_id = u.recipient_user_id
    LEFT JOIN public.tbl_wallet_transactions tx
      ON tx.twt_id = income.trli_wallet_transaction_id
  ),
  explained AS (
    SELECT
      d.*,
      CASE
        WHEN COALESCE(v_assignment.turc_reward_amount, 0) <= 0 THEN 'empty_source_reward'
        WHEN NOT d.recipient_is_valid_roi_customer THEN 'invalid_roi_customer'
        WHEN d.expected_income_amount <= 0 THEN 'zero_income_amount'
        WHEN d.max_eligible_level < d.level THEN 'plan_level_cap_not_met'
        WHEN d.valid_direct_count < d.required_directs THEN 'direct_join_requirement_not_met'
        WHEN d.existing_income_status = 'credited' AND d.existing_wallet_transaction_id IS NOT NULL THEN 'already_credited'
        WHEN d.existing_income_status = 'credited' AND d.existing_wallet_transaction_id IS NULL THEN 'credited_row_missing_wallet_tx'
        ELSE 'eligible_to_credit'
      END AS diagnosis
    FROM diagnosed d
  )
  SELECT
    COUNT(*)::integer,
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'level', level,
          'diagnosis', diagnosis,
          'recipient_user_id', recipient_user_id,
          'recipient_email', recipient_email,
          'parent_lookup_used', parent_lookup_used,
          'child_user_id', child_user_id,
          'child_referrer_id', child_referrer_id,
          'child_parent_key', child_parent_key,
          'parent_by_ref_id', parent_by_ref_id,
          'parent_by_profile_id', parent_by_profile_id,
          'recipient_user_type', recipient_user_type,
          'recipient_is_active', recipient_is_active,
          'recipient_registration_paid', recipient_registration_paid,
          'recipient_email_verified', recipient_email_verified,
          'recipient_mobile_verified', recipient_mobile_verified,
          'recipient_contact_verified', recipient_contact_verified,
          'recipient_has_launch_subscription', recipient_has_launch_subscription,
          'recipient_is_valid_roi_customer', recipient_is_valid_roi_customer,
          'valid_direct_count', valid_direct_count,
          'required_directs', required_directs,
          'max_eligible_level', max_eligible_level,
          'percentage', percentage,
          'expected_income_amount', expected_income_amount,
          'existing_income_status', existing_income_status,
          'existing_skip_reason', existing_skip_reason,
          'existing_wallet_transaction_id', existing_wallet_transaction_id,
          'existing_wallet_transaction_status', existing_wallet_transaction_status
        )
        ORDER BY level
      ),
      '[]'::jsonb
    )
  INTO v_upline_count, v_uplines
  FROM explained;

  RETURN jsonb_build_object(
    'success', true,
    'assignment', jsonb_build_object(
      'assignment_id', v_assignment.turc_id,
      'source_user_id', v_assignment.turc_user_id,
      'source_email', v_assignment.tu_email,
      'source_referrer_id', v_assignment.tu_referrer_id,
      'source_sponsorship_number', v_assignment.tup_sponsorship_number,
      'source_parent_account', v_assignment.tup_parent_account,
      'coupon_id', v_assignment.turc_coupon_id,
      'coupon_title', v_assignment.tc_title,
      'status', v_assignment.turc_status,
      'reaction', v_assignment.turc_reaction,
      'rating', v_assignment.turc_rating,
      'reward_amount', v_assignment.turc_reward_amount,
      'site_visited_at', v_assignment.turc_site_visited_at,
      'reacted_at', v_assignment.turc_reacted_at
    ),
    'reward_coupon_wallet_transactions', v_reward_tx_count,
    'roi_level_income_rows', v_roi_income_count,
    'upline_count', v_upline_count,
    'uplines', v_uplines
  );
END;
$roi_level_debug$;

REVOKE EXECUTE ON FUNCTION public.debug_roi_level_income_for_reward_coupon(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.debug_roi_level_income_for_reward_coupon(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.debug_roi_level_income_for_reward_coupon(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.debug_roi_level_income_for_reward_coupon(uuid) TO service_role;
