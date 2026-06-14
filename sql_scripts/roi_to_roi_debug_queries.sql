-- ROI-to-ROI debug helper queries.
-- Run these after applying the ROI migrations, especially:
-- 20260613090000_roi_to_roi_level_income.sql
-- 20260613093000_fix_roi_level_income_parent_lookup.sql
-- 20260613100000_recredit_locked_roi_level_income.sql
-- 20260613103000_enforce_roi_level_income_active_customer_eligibility.sql
-- 20260614090000_debug_roi_level_income.sql

-- Set the assignment to debug once, then reuse it below.
-- Latest failing sample from Query 1:
-- 98306895-1857-493b-85f1-9984f4fe76ac

-- 1) Find recently completed reward coupon assignments.
SELECT
  rc.turc_id AS assignment_id,
  rc.turc_user_id AS source_user_id,
  u.tu_email AS source_email,
  up.tup_sponsorship_number AS source_sponsorship_number,
  up.tup_parent_account AS source_parent_account,
  rc.turc_status,
  rc.turc_reaction,
  rc.turc_rating,
  rc.turc_reward_amount,
  rc.turc_reacted_at,
  COUNT(DISTINCT tx.twt_id) FILTER (
    WHERE tx.twt_reference_type = 'reward_coupon'
      AND tx.twt_status = 'completed'
  ) AS reward_coupon_wallet_tx_count,
  COUNT(DISTINCT income.trli_id) AS roi_level_income_row_count
FROM public.tbl_user_reward_coupons rc
JOIN public.tbl_users u ON u.tu_id = rc.turc_user_id
LEFT JOIN public.tbl_user_profiles up ON up.tup_user_id = rc.turc_user_id
LEFT JOIN public.tbl_wallet_transactions tx
  ON tx.twt_reference_type = 'reward_coupon'
 AND tx.twt_reference_id = rc.turc_id
LEFT JOIN public.tbl_roi_level_incomes income ON income.trli_assignment_id = rc.turc_id
WHERE rc.turc_status IN ('liked', 'disliked')
GROUP BY
  rc.turc_id,
  rc.turc_user_id,
  u.tu_email,
  up.tup_sponsorship_number,
  up.tup_parent_account,
  rc.turc_status,
  rc.turc_reaction,
  rc.turc_rating,
  rc.turc_reward_amount,
  rc.turc_reacted_at
ORDER BY rc.turc_reacted_at DESC NULLS LAST
LIMIT 20;

-- 2) Full JSON diagnosis for one assignment.
WITH target AS (
  SELECT '98306895-1857-493b-85f1-9984f4fe76ac'::uuid AS assignment_id
)
SELECT public.debug_roi_level_income_for_reward_coupon(target.assignment_id) AS roi_debug
FROM target;

-- 3) Expanded upline diagnosis rows for one assignment.
WITH target AS (
  SELECT '98306895-1857-493b-85f1-9984f4fe76ac'::uuid AS assignment_id
),
debug AS (
  SELECT public.debug_roi_level_income_for_reward_coupon(target.assignment_id) AS payload
  FROM target
)
SELECT
  row_data->>'level' AS level,
  row_data->>'diagnosis' AS diagnosis,
  row_data->>'recipient_email' AS recipient_email,
  row_data->>'recipient_user_id' AS recipient_user_id,
  row_data->>'parent_lookup_used' AS parent_lookup_used,
  row_data->>'recipient_is_active' AS active,
  row_data->>'recipient_registration_paid' AS registration_paid,
  row_data->>'recipient_contact_verified' AS contact_verified,
  row_data->>'recipient_has_launch_subscription' AS launch_subscription,
  row_data->>'recipient_is_valid_roi_customer' AS valid_roi_customer,
  row_data->>'valid_direct_count' AS valid_direct_count,
  row_data->>'required_directs' AS required_directs,
  row_data->>'max_eligible_level' AS max_eligible_level,
  row_data->>'expected_income_amount' AS expected_income_amount,
  row_data->>'existing_income_status' AS existing_income_status,
  row_data->>'existing_skip_reason' AS existing_skip_reason,
  row_data->>'existing_wallet_transaction_id' AS wallet_transaction_id
FROM debug
CROSS JOIN LATERAL jsonb_array_elements(payload->'uplines') AS rows(row_data)
ORDER BY (row_data->>'level')::integer;

-- 4) If query 3 shows eligible_to_credit, run the payout function manually.
-- This is idempotent for already credited rows.
WITH target AS (
  SELECT '98306895-1857-493b-85f1-9984f4fe76ac'::uuid AS assignment_id
)
SELECT public.award_roi_level_income_for_reward_coupon(target.assignment_id) AS award_result
FROM target;

-- 5) Check final ROI income and wallet transaction rows.
WITH target AS (
  SELECT '98306895-1857-493b-85f1-9984f4fe76ac'::uuid AS assignment_id
)
SELECT
  income.trli_level,
  income.trli_status,
  income.trli_skip_reason,
  income.trli_income_amount,
  income.trli_required_directs,
  income.trli_directs_at_award,
  income.trli_max_eligible_level,
  recipient.tu_email AS recipient_email,
  tx.twt_id AS wallet_transaction_id,
  tx.twt_status AS wallet_transaction_status,
  tx.twt_amount AS wallet_transaction_amount
FROM public.tbl_roi_level_incomes income
JOIN public.tbl_users recipient ON recipient.tu_id = income.trli_recipient_user_id
LEFT JOIN public.tbl_wallet_transactions tx ON tx.twt_id = income.trli_wallet_transaction_id
JOIN target ON target.assignment_id = income.trli_assignment_id
ORDER BY income.trli_level;

-- 6) Quick check for the visible parent account from query 1.
-- If this returns false flags, the parent will not receive ROI-to-ROI.
SELECT
  parent_profile.tup_user_id AS parent_user_id,
  parent_user.tu_email AS parent_email,
  parent_profile.tup_sponsorship_number,
  parent_user.tu_user_type,
  parent_user.tu_is_active,
  parent_user.tu_registration_paid,
  parent_user.tu_email_verified,
  parent_user.tu_mobile_verified,
  public.meets_current_verification_requirements(
    parent_user.tu_email_verified,
    parent_user.tu_mobile_verified
  ) AS contact_verified,
  EXISTS (
    SELECT 1
    FROM public.tbl_user_subscriptions us
    JOIN public.tbl_subscription_plans sp ON sp.tsp_id = us.tus_plan_id
    WHERE us.tus_user_id = parent_user.tu_id
      AND us.tus_status IN ('active', 'upgraded')
      AND (us.tus_end_date IS NULL OR us.tus_end_date > now())
      AND COALESCE(us.tus_plan_phase, sp.tsp_plan_phase, 'prelaunch') = 'launch'
  ) AS has_launch_subscription,
  public.is_valid_roi_active_customer(parent_user.tu_id) AS valid_roi_customer,
  public.count_paid_direct_joins(parent_user.tu_id) AS valid_direct_count,
  public.get_user_roi_level_cap(parent_user.tu_id) AS max_eligible_level
FROM public.tbl_user_profiles parent_profile
JOIN public.tbl_users parent_user ON parent_user.tu_id = parent_profile.tup_user_id
WHERE public.normalize_sponsorship_key(parent_profile.tup_sponsorship_number)
  = public.normalize_sponsorship_key('SP84565030');

-- 7) Check whether live rate_reward_coupon contains the ROI-to-ROI call.
-- If has_roi_award_call is false, apply:
-- 20260614093000_restore_roi_award_call_and_backfill.sql
SELECT
  position(
    'award_roi_level_income_for_reward_coupon'
    IN pg_get_functiondef('public.rate_reward_coupon(uuid, integer)'::regprocedure)
  ) > 0 AS has_roi_award_call,
  pg_get_functiondef('public.rate_reward_coupon(uuid, integer)'::regprocedure) AS function_definition;

-- 8) Backfill only the failing sample assignment after applying the latest
-- function definitions. This is idempotent for already credited parents.
-- Re-run this after applying:
-- 20260614101500_roi_direct_count_active_customers_only.sql
WITH target AS (
  SELECT '98306895-1857-493b-85f1-9984f4fe76ac'::uuid AS assignment_id
)
SELECT public.award_roi_level_income_for_reward_coupon(target.assignment_id) AS award_result
FROM target;

-- 9) After applying 20260614094500_record_invalid_roi_uplines.sql and running
-- Query 8, use this to see why locked parents were not credited.
WITH target AS (
  SELECT '98306895-1857-493b-85f1-9984f4fe76ac'::uuid AS assignment_id
)
SELECT
  income.trli_level,
  income.trli_status,
  income.trli_skip_reason,
  income.trli_income_amount,
  income.trli_required_directs,
  income.trli_directs_at_award,
  income.trli_max_eligible_level,
  recipient.tu_email AS recipient_email,
  recipient.tu_user_type,
  recipient.tu_is_active,
  recipient.tu_registration_paid,
  recipient.tu_email_verified,
  recipient.tu_mobile_verified,
  public.meets_current_verification_requirements(
    recipient.tu_email_verified,
    recipient.tu_mobile_verified
  ) AS contact_verified,
  EXISTS (
    SELECT 1
    FROM public.tbl_user_subscriptions us
    JOIN public.tbl_subscription_plans sp ON sp.tsp_id = us.tus_plan_id
    WHERE us.tus_user_id = recipient.tu_id
      AND us.tus_status IN ('active', 'upgraded')
      AND (us.tus_end_date IS NULL OR us.tus_end_date > now())
      AND COALESCE(us.tus_plan_phase, sp.tsp_plan_phase, 'prelaunch') = 'launch'
  ) AS has_launch_subscription,
  tx.twt_id AS wallet_transaction_id
FROM public.tbl_roi_level_incomes income
JOIN target ON target.assignment_id = income.trli_assignment_id
JOIN public.tbl_users recipient ON recipient.tu_id = income.trli_recipient_user_id
LEFT JOIN public.tbl_wallet_transactions tx ON tx.twt_id = income.trli_wallet_transaction_id
ORDER BY income.trli_level;

-- 10) Inspect subscription rows for the locked ROI parents.
-- Use this when Query 9 shows has_launch_subscription = false.
WITH target AS (
  SELECT '98306895-1857-493b-85f1-9984f4fe76ac'::uuid AS assignment_id
),
locked_recipients AS (
  SELECT DISTINCT
    income.trli_level,
    income.trli_recipient_user_id
  FROM public.tbl_roi_level_incomes income
  JOIN target ON target.assignment_id = income.trli_assignment_id
)
SELECT
  lr.trli_level,
  u.tu_email,
  u.tu_current_plan_phase,
  u.tu_launch_plan_activated_at,
  us.tus_id,
  us.tus_status,
  us.tus_plan_phase AS subscription_plan_phase,
  us.tus_start_date,
  us.tus_end_date,
  us.tus_payment_amount,
  sp.tsp_id,
  sp.tsp_name,
  sp.tsp_type,
  sp.tsp_plan_phase AS plan_phase,
  sp.tsp_duration_days,
  sp.tsp_price,
  CASE
    WHEN us.tus_id IS NULL THEN 'no_subscription_row'
    WHEN us.tus_status NOT IN ('active', 'upgraded') THEN 'subscription_status_not_eligible'
    WHEN us.tus_end_date IS NOT NULL AND us.tus_end_date <= now() THEN 'subscription_expired'
    WHEN COALESCE(us.tus_plan_phase, sp.tsp_plan_phase, 'prelaunch') <> 'launch' THEN 'not_launch_phase_subscription'
    WHEN COALESCE(sp.tsp_duration_days, 30) = 0 THEN 'launch_lifetime_subscription_ok'
    ELSE 'launch_subscription_ok'
  END AS launch_subscription_diagnosis
FROM locked_recipients lr
JOIN public.tbl_users u ON u.tu_id = lr.trli_recipient_user_id
LEFT JOIN public.tbl_user_subscriptions us ON us.tus_user_id = u.tu_id
LEFT JOIN public.tbl_subscription_plans sp ON sp.tsp_id = us.tus_plan_id
ORDER BY lr.trli_level, us.tus_start_date DESC NULLS LAST;

-- 11) Inspect direct children for locked ROI parents.
-- This explains why trli_directs_at_award may be lower than the visible
-- network/direct list count. ROI direct count uses valid active Launch direct
-- customers only.
WITH target AS (
  SELECT '98306895-1857-493b-85f1-9984f4fe76ac'::uuid AS assignment_id
),
locked_parents AS (
  SELECT DISTINCT
    income.trli_level,
    income.trli_recipient_user_id AS parent_user_id
  FROM public.tbl_roi_level_incomes income
  JOIN target ON target.assignment_id = income.trli_assignment_id
  WHERE income.trli_status = 'locked'
    AND income.trli_skip_reason = 'direct_join_requirement_not_met'
),
parent_keys AS (
  SELECT
    lp.trli_level,
    lp.parent_user_id,
    parent_user.tu_email AS parent_email,
    parent_profile.tup_sponsorship_number AS parent_sponsorship_number,
    public.normalize_sponsorship_key(parent_profile.tup_sponsorship_number) AS parent_key
  FROM locked_parents lp
  JOIN public.tbl_users parent_user ON parent_user.tu_id = lp.parent_user_id
  LEFT JOIN public.tbl_user_profiles parent_profile ON parent_profile.tup_user_id = lp.parent_user_id
),
direct_children AS (
  SELECT DISTINCT
    pk.trli_level,
    pk.parent_user_id,
    pk.parent_email,
    pk.parent_sponsorship_number,
    child.tu_id AS child_user_id
  FROM parent_keys pk
  JOIN public.tbl_users child
    ON child.tu_referrer_id = pk.parent_user_id
  UNION
  SELECT DISTINCT
    pk.trli_level,
    pk.parent_user_id,
    pk.parent_email,
    pk.parent_sponsorship_number,
    child_profile.tup_user_id AS child_user_id
  FROM parent_keys pk
  JOIN public.tbl_user_profiles child_profile
    ON public.normalize_sponsorship_key(child_profile.tup_parent_account) = pk.parent_key
)
SELECT
  dc.trli_level AS locked_parent_level,
  dc.parent_email,
  dc.parent_sponsorship_number,
  child_profile.tup_first_name,
  child_profile.tup_last_name,
  child_profile.tup_username,
  child_profile.tup_sponsorship_number AS child_sponsorship_number,
  child_profile.tup_parent_account AS child_parent_account,
  child.tu_email AS child_email,
  child.tu_user_type,
  child.tu_is_dummy,
  child.tu_is_active,
  child.tu_registration_paid,
  child.tu_email_verified,
  child.tu_mobile_verified,
  public.meets_current_verification_requirements(
    child.tu_email_verified,
    child.tu_mobile_verified
  ) AS contact_verified,
  EXISTS (
    SELECT 1
    FROM public.tbl_user_subscriptions us
    JOIN public.tbl_subscription_plans sp ON sp.tsp_id = us.tus_plan_id
    WHERE us.tus_user_id = child.tu_id
      AND us.tus_status IN ('active', 'upgraded')
      AND (us.tus_end_date IS NULL OR us.tus_end_date > now())
      AND COALESCE(us.tus_plan_phase, sp.tsp_plan_phase, 'prelaunch') = 'launch'
  ) AS has_launch_subscription,
  public.is_valid_roi_direct_customer(child.tu_id) AS counts_for_roi_directs,
  CASE
    WHEN child.tu_id IS NULL THEN 'missing_child_user'
    WHEN child.tu_user_type <> 'customer' THEN 'not_customer'
    WHEN COALESCE(child.tu_is_dummy, false) = true THEN 'dummy_account'
    WHEN COALESCE(child.tu_is_active, false) = false THEN 'inactive_user'
    WHEN COALESCE(child.tu_registration_paid, false) = false THEN 'registration_not_paid'
    WHEN NOT public.meets_current_verification_requirements(child.tu_email_verified, child.tu_mobile_verified) THEN 'contact_not_verified'
    WHEN NOT EXISTS (
      SELECT 1
      FROM public.tbl_user_subscriptions us
      JOIN public.tbl_subscription_plans sp ON sp.tsp_id = us.tus_plan_id
      WHERE us.tus_user_id = child.tu_id
        AND us.tus_status IN ('active', 'upgraded')
        AND (us.tus_end_date IS NULL OR us.tus_end_date > now())
        AND COALESCE(us.tus_plan_phase, sp.tsp_plan_phase, 'prelaunch') = 'launch'
    ) THEN 'no_active_launch_subscription'
    ELSE 'counts_for_roi_directs'
  END AS direct_count_diagnosis
FROM direct_children dc
JOIN public.tbl_users child ON child.tu_id = dc.child_user_id
LEFT JOIN public.tbl_user_profiles child_profile ON child_profile.tup_user_id = child.tu_id
ORDER BY dc.trli_level, counts_for_roi_directs DESC, child_profile.tup_first_name NULLS LAST, child.tu_email;

-- 12) Summary of visible direct children vs ROI-countable direct children.
WITH target AS (
  SELECT '98306895-1857-493b-85f1-9984f4fe76ac'::uuid AS assignment_id
),
locked_parents AS (
  SELECT DISTINCT
    income.trli_level,
    income.trli_recipient_user_id AS parent_user_id,
    income.trli_required_directs,
    income.trli_directs_at_award
  FROM public.tbl_roi_level_incomes income
  JOIN target ON target.assignment_id = income.trli_assignment_id
  WHERE income.trli_status = 'locked'
    AND income.trli_skip_reason = 'direct_join_requirement_not_met'
),
parent_keys AS (
  SELECT
    lp.*,
    parent_user.tu_email AS parent_email,
    parent_profile.tup_sponsorship_number AS parent_sponsorship_number,
    public.normalize_sponsorship_key(parent_profile.tup_sponsorship_number) AS parent_key
  FROM locked_parents lp
  JOIN public.tbl_users parent_user ON parent_user.tu_id = lp.parent_user_id
  LEFT JOIN public.tbl_user_profiles parent_profile ON parent_profile.tup_user_id = lp.parent_user_id
),
direct_children AS (
  SELECT DISTINCT
    pk.trli_level,
    pk.parent_user_id,
    child.tu_id AS child_user_id
  FROM parent_keys pk
  JOIN public.tbl_users child
    ON child.tu_referrer_id = pk.parent_user_id
  UNION
  SELECT DISTINCT
    pk.trli_level,
    pk.parent_user_id,
    child_profile.tup_user_id AS child_user_id
  FROM parent_keys pk
  JOIN public.tbl_user_profiles child_profile
    ON public.normalize_sponsorship_key(child_profile.tup_parent_account) = pk.parent_key
)
SELECT
  pk.trli_level,
  pk.parent_email,
  pk.parent_sponsorship_number,
  pk.trli_required_directs,
  pk.trli_directs_at_award AS recorded_roi_directs,
  COUNT(DISTINCT dc.child_user_id) AS visible_direct_children,
  COUNT(DISTINCT dc.child_user_id) FILTER (
    WHERE public.is_valid_roi_direct_customer(dc.child_user_id)
  ) AS roi_countable_direct_children
FROM parent_keys pk
LEFT JOIN direct_children dc
  ON dc.trli_level = pk.trli_level
 AND dc.parent_user_id = pk.parent_user_id
GROUP BY
  pk.trli_level,
  pk.parent_email,
  pk.parent_sponsorship_number,
  pk.trli_required_directs,
  pk.trli_directs_at_award
ORDER BY pk.trli_level;
