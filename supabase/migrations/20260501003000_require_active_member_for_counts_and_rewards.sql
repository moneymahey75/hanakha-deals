/*
  # Require "active member" for counts + rewards

  Active member definition (everywhere):
  - tu_is_active = true
  - tu_registration_paid = true
  - tu_mobile_verified = true

  Updates:
  - MLM level counts (levels 1..3) + extra/N-level counts include mobile-verified requirement.
  - Wallet reward RPCs reject non-active-members (task completion / wallet update helper).
*/

-- Ensure MLM counts only include active members
CREATE OR REPLACE FUNCTION upsert_mlm_level_counts(
  p_sponsorship_number text
) RETURNS TABLE(
  user_id uuid,
  level1_count integer,
  level2_count integer,
  level3_count integer
)
SECURITY DEFINER
SET search_path = public
LANGUAGE sql
AS $sql$
WITH RECURSIVE sponsor AS (
  SELECT
    up.tup_user_id AS user_id,
    btrim(up.tup_sponsorship_number) AS sponsorship_number
  FROM tbl_user_profiles up
  WHERE lower(btrim(up.tup_sponsorship_number)) = lower(btrim(p_sponsorship_number))
  LIMIT 1
),
network_tree AS (
  SELECT
    sponsor.user_id AS root_user_id,
    sponsor.sponsorship_number AS root_sponsorship_number,
    up.tup_user_id,
    up.tup_sponsorship_number,
    up.tup_parent_account,
    1 AS level
  FROM sponsor
  JOIN tbl_user_profiles up
    ON lower(btrim(up.tup_parent_account)) = lower(btrim(sponsor.sponsorship_number))
  WHERE up.tup_user_id IS NOT NULL
    AND up.tup_sponsorship_number IS NOT NULL

  UNION ALL

  SELECT
    nt.root_user_id,
    nt.root_sponsorship_number,
    up.tup_user_id,
    up.tup_sponsorship_number,
    up.tup_parent_account,
    nt.level + 1
  FROM network_tree nt
  JOIN tbl_user_profiles up
    ON lower(btrim(up.tup_parent_account)) = lower(btrim(nt.tup_sponsorship_number))
  WHERE nt.level < 3
    AND up.tup_user_id IS NOT NULL
    AND up.tup_sponsorship_number IS NOT NULL
),
counts AS (
  SELECT
    sponsor.user_id,
    sponsor.sponsorship_number,
    COALESCE(SUM(CASE WHEN nt.level = 1 AND u.tu_is_active = true AND u.tu_registration_paid = true AND u.tu_mobile_verified = true THEN 1 ELSE 0 END), 0)::int AS level1_count,
    COALESCE(SUM(CASE WHEN nt.level = 2 AND u.tu_is_active = true AND u.tu_registration_paid = true AND u.tu_mobile_verified = true THEN 1 ELSE 0 END), 0)::int AS level2_count,
    COALESCE(SUM(CASE WHEN nt.level = 3 AND u.tu_is_active = true AND u.tu_registration_paid = true AND u.tu_mobile_verified = true THEN 1 ELSE 0 END), 0)::int AS level3_count
  FROM sponsor
  LEFT JOIN network_tree nt ON true
  LEFT JOIN tbl_users u ON u.tu_id = nt.tup_user_id
  WHERE sponsor.user_id IS NOT NULL
    AND sponsor.sponsorship_number IS NOT NULL
    AND btrim(sponsor.sponsorship_number) <> ''
  GROUP BY sponsor.user_id, sponsor.sponsorship_number
),
upserted AS (
  INSERT INTO tbl_mlm_level_counts (
    tmlc_user_id,
    tmlc_sponsorship_number,
    tmlc_level1_count,
    tmlc_level2_count,
    tmlc_level3_count,
    tmlc_updated_at
  )
  SELECT
    c.user_id,
    c.sponsorship_number,
    c.level1_count,
    c.level2_count,
    c.level3_count,
    now()
  FROM counts c
  ON CONFLICT (tmlc_user_id) DO UPDATE
  SET
    tmlc_sponsorship_number = EXCLUDED.tmlc_sponsorship_number,
    tmlc_level1_count = EXCLUDED.tmlc_level1_count,
    tmlc_level2_count = EXCLUDED.tmlc_level2_count,
    tmlc_level3_count = EXCLUDED.tmlc_level3_count,
    tmlc_updated_at = now()
  RETURNING
    tmlc_user_id,
    tmlc_level1_count,
    tmlc_level2_count,
    tmlc_level3_count
)
SELECT
  u.tmlc_user_id AS user_id,
  u.tmlc_level1_count AS level1_count,
  u.tmlc_level2_count AS level2_count,
  u.tmlc_level3_count AS level3_count
FROM upserted u
$sql$;

-- Ensure N-level counts only include active members
CREATE OR REPLACE FUNCTION get_mlm_level_counts_for_sponsors_at_level(
  p_sponsorship_numbers text[],
  p_level int
)
RETURNS TABLE (
  sponsorship_number text,
  level_count int
)
SECURITY DEFINER
SET search_path = public
LANGUAGE sql
AS $sql$
WITH RECURSIVE seed AS (
  SELECT lower(btrim(s)) AS sponsor
  FROM unnest(p_sponsorship_numbers) AS s
  WHERE btrim(s) <> ''
),
tree AS (
  SELECT
    seed.sponsor AS root_sponsor,
    up.tup_user_id,
    up.tup_sponsorship_number,
    up.tup_parent_account,
    1 AS level
  FROM seed
  JOIN tbl_user_profiles up
    ON lower(btrim(up.tup_parent_account)) = seed.sponsor
  WHERE up.tup_user_id IS NOT NULL
    AND up.tup_sponsorship_number IS NOT NULL

  UNION ALL

  SELECT
    t.root_sponsor,
    up.tup_user_id,
    up.tup_sponsorship_number,
    up.tup_parent_account,
    t.level + 1
  FROM tree t
  JOIN tbl_user_profiles up
    ON lower(btrim(up.tup_parent_account)) = lower(btrim(t.tup_sponsorship_number))
  WHERE t.level < p_level
    AND up.tup_user_id IS NOT NULL
    AND up.tup_sponsorship_number IS NOT NULL
)
SELECT
  tree.root_sponsor AS sponsorship_number,
  COALESCE(
    SUM(
      CASE
        WHEN tree.level = p_level AND u.tu_is_active = true AND u.tu_registration_paid = true AND u.tu_mobile_verified = true THEN 1
        ELSE 0
      END
    ),
    0
  )::int AS level_count
FROM tree
JOIN tbl_users u ON u.tu_id = tree.tup_user_id
GROUP BY tree.root_sponsor
$sql$;

-- Block wallet reward operations for non-active-members
DROP FUNCTION IF EXISTS public.update_wallet_balance(uuid, numeric, text, text, text, uuid);
CREATE OR REPLACE FUNCTION update_wallet_balance(
  p_user_id uuid,
  p_amount numeric(18,8),
  p_transaction_type text,
  p_description text,
  p_reference_type text DEFAULT NULL,
  p_reference_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wallet_id uuid;
  v_current_balance numeric(18,8);
  v_new_balance numeric(18,8);
  v_transaction_id uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM tbl_users u
    WHERE u.tu_id = p_user_id
      AND u.tu_is_active = true
      AND u.tu_registration_paid = true
      AND u.tu_mobile_verified = true
  ) THEN
    RAISE EXCEPTION 'Account is not active/verified or registration-paid';
  END IF;

  SELECT tw_id, tw_balance INTO v_wallet_id, v_current_balance
  FROM tbl_wallets
  WHERE tw_user_id = p_user_id AND tw_currency = 'USDT';

  IF v_wallet_id IS NULL THEN
    RAISE EXCEPTION 'Wallet not found for user';
  END IF;

  IF p_transaction_type = 'credit' THEN
    v_new_balance := v_current_balance + p_amount;
  ELSIF p_transaction_type = 'debit' THEN
    IF v_current_balance < p_amount THEN
      RAISE EXCEPTION 'Insufficient balance';
    END IF;
    v_new_balance := v_current_balance - p_amount;
  ELSE
    RAISE EXCEPTION 'Invalid transaction type';
  END IF;

  UPDATE tbl_wallets
  SET tw_balance = v_new_balance, tw_updated_at = now()
  WHERE tw_id = v_wallet_id;

  INSERT INTO tbl_wallet_transactions (
    twt_wallet_id, twt_user_id, twt_transaction_type, twt_amount,
    twt_description, twt_reference_type, twt_reference_id
  ) VALUES (
    v_wallet_id, p_user_id, p_transaction_type, p_amount,
    p_description, p_reference_type, p_reference_id
  ) RETURNING twt_id INTO v_transaction_id;

  RETURN json_build_object(
    'success', true,
    'wallet_id', v_wallet_id,
    'transaction_id', v_transaction_id,
    'old_balance', v_current_balance,
    'new_balance', v_new_balance
  );
END;
$$;

DROP FUNCTION IF EXISTS public.complete_user_task(uuid, uuid, text, text, text);
CREATE OR REPLACE FUNCTION complete_user_task(
  p_user_id uuid,
  p_task_id uuid,
  p_share_url text,
  p_platform text,
  p_screenshot_url text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task record;
  v_user_task record;
  v_reward_result json;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM tbl_users u
    WHERE u.tu_id = p_user_id
      AND u.tu_is_active = true
      AND u.tu_registration_paid = true
      AND u.tu_mobile_verified = true
  ) THEN
    RAISE EXCEPTION 'Account is not active/verified or registration-paid';
  END IF;

  SELECT * INTO v_task FROM tbl_daily_tasks WHERE tdt_id = p_task_id;
  IF v_task IS NULL THEN
    RAISE EXCEPTION 'Task not found';
  END IF;

  IF v_task.tdt_expires_at <= now() THEN
    RAISE EXCEPTION 'Task has expired';
  END IF;

  SELECT * INTO v_user_task FROM tbl_user_tasks
  WHERE tut_user_id = p_user_id AND tut_task_id = p_task_id;

  IF v_user_task IS NULL THEN
    RAISE EXCEPTION 'Task not assigned to user';
  END IF;

  IF v_user_task.tut_completion_status = 'completed' THEN
    RAISE EXCEPTION 'Task already completed';
  END IF;

  UPDATE tbl_user_tasks
  SET
    tut_completion_status = 'completed',
    tut_share_url = p_share_url,
    tut_share_platform = p_platform,
    tut_share_screenshot_url = p_screenshot_url,
    tut_completed_at = now(),
    tut_updated_at = now()
  WHERE tut_id = v_user_task.tut_id;

  INSERT INTO tbl_social_shares (
    tss_user_id, tss_task_id, tss_coupon_id, tss_platform,
    tss_share_url, tss_content_type, tss_screenshot_url, tss_reward_amount
  ) VALUES (
    p_user_id, p_task_id, v_task.tdt_coupon_id, p_platform,
    p_share_url, v_task.tdt_task_type, p_screenshot_url, v_task.tdt_reward_amount
  );

  SELECT update_wallet_balance(
    p_user_id,
    v_task.tdt_reward_amount,
    'credit',
    'Task completion reward: ' || v_task.tdt_title,
    'task_reward',
    p_task_id
  ) INTO v_reward_result;

  UPDATE tbl_daily_tasks
  SET tdt_completed_count = tdt_completed_count + 1
  WHERE tdt_id = p_task_id;

  UPDATE tbl_user_tasks
  SET tut_reward_paid = true
  WHERE tut_id = v_user_task.tut_id;

  RETURN json_build_object(
    'success', true,
    'message', 'Task completed and reward credited',
    'reward_amount', v_task.tdt_reward_amount,
    'wallet_update', v_reward_result
  );
END;
$$;
