/*
  Make "active member" require at least one verified contact method.
*/

CREATE OR REPLACE FUNCTION public.meets_current_verification_requirements(
  p_email_verified boolean,
  p_mobile_verified boolean
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
SELECT COALESCE(p_email_verified, false) OR COALESCE(p_mobile_verified, false)
$$;

CREATE OR REPLACE FUNCTION public.is_user_active_member(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
SELECT EXISTS (
  SELECT 1
  FROM tbl_users u
  WHERE u.tu_id = p_user_id
    AND COALESCE(u.tu_is_active, false) = true
    AND COALESCE(u.tu_registration_paid, false) = true
    AND public.meets_current_verification_requirements(u.tu_email_verified, u.tu_mobile_verified)
)
$$;

GRANT EXECUTE ON FUNCTION public.meets_current_verification_requirements(boolean, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_user_active_member(uuid) TO authenticated, service_role;

UPDATE tbl_users
SET tu_is_verified = true
WHERE COALESCE(tu_is_verified, false) = false
  AND (COALESCE(tu_email_verified, false) = true OR COALESCE(tu_mobile_verified, false) = true);

DROP FUNCTION IF EXISTS public.admin_get_customers(TEXT, TEXT, TEXT, INT, INT);
DROP FUNCTION IF EXISTS public.admin_get_customers(TEXT, TEXT, TEXT, INT, INT, TEXT);

CREATE OR REPLACE FUNCTION public.admin_get_customers(
  p_search_term TEXT DEFAULT NULL,
  p_status_filter TEXT DEFAULT 'all',
  p_verification_filter TEXT DEFAULT 'all',
  p_offset INT DEFAULT 0,
  p_limit INT DEFAULT 10,
  p_dummy_filter TEXT DEFAULT 'all'
)
RETURNS TABLE (
  tu_id UUID,
  tu_email TEXT,
  tu_user_type TEXT,
  tu_is_verified BOOLEAN,
  tu_email_verified BOOLEAN,
  tu_mobile_verified BOOLEAN,
  tu_registration_paid BOOLEAN,
  tu_is_active BOOLEAN,
  tu_is_dummy BOOLEAN,
  tu_created_at TIMESTAMPTZ,
  tu_updated_at TIMESTAMPTZ,
  profile_data JSONB,
  total_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_count BIGINT;
  v_status_filter TEXT := LOWER(COALESCE(p_status_filter, 'all'));
  v_verification_filter TEXT := LOWER(COALESCE(p_verification_filter, 'all'));
  v_dummy_filter TEXT := LOWER(COALESCE(p_dummy_filter, 'all'));
BEGIN
  SELECT COUNT(*)
  INTO v_total_count
  FROM tbl_users u
  LEFT JOIN tbl_user_profiles p ON u.tu_id = p.tup_user_id
  WHERE u.tu_user_type = 'customer'
    AND (
      p_search_term IS NULL OR
      u.tu_email ILIKE '%' || p_search_term || '%' OR
      p.tup_first_name ILIKE '%' || p_search_term || '%' OR
      p.tup_last_name ILIKE '%' || p_search_term || '%' OR
      p.tup_username ILIKE '%' || p_search_term || '%' OR
      p.tup_sponsorship_number ILIKE '%' || p_search_term || '%'
    )
    AND (
      v_status_filter = 'all' OR
      (v_status_filter IN ('disabled', 'inactive') AND COALESCE(u.tu_is_active, false) = false) OR
      (v_status_filter = 'active' AND public.is_user_active_member(u.tu_id)) OR
      (
        v_status_filter = 'pending'
        AND COALESCE(u.tu_is_active, false) = true
        AND NOT public.is_user_active_member(u.tu_id)
      )
    )
    AND (
      v_verification_filter = 'all' OR
      (
        v_verification_filter = 'verified'
        AND public.meets_current_verification_requirements(u.tu_email_verified, u.tu_mobile_verified)
      ) OR
      (
        v_verification_filter = 'unverified'
        AND NOT public.meets_current_verification_requirements(u.tu_email_verified, u.tu_mobile_verified)
      )
    )
    AND (
      v_dummy_filter = 'all' OR
      (v_dummy_filter = 'real' AND COALESCE(u.tu_is_dummy, false) = false) OR
      (v_dummy_filter = 'dummy' AND COALESCE(u.tu_is_dummy, false) = true)
    );

  RETURN QUERY
  SELECT
    u.tu_id,
    u.tu_email,
    u.tu_user_type,
    public.meets_current_verification_requirements(u.tu_email_verified, u.tu_mobile_verified) AS tu_is_verified,
    u.tu_email_verified,
    u.tu_mobile_verified,
    COALESCE(u.tu_registration_paid, false),
    COALESCE(u.tu_is_active, false),
    COALESCE(u.tu_is_dummy, false),
    u.tu_created_at,
    u.tu_updated_at,
    jsonb_build_object(
      'tup_id', p.tup_id,
      'tup_first_name', p.tup_first_name,
      'tup_last_name', p.tup_last_name,
      'tup_username', p.tup_username,
      'tup_mobile', p.tup_mobile,
      'tup_gender', p.tup_gender,
      'tup_sponsorship_number', p.tup_sponsorship_number,
      'tup_parent_account', p.tup_parent_account,
      'tup_parent_name', NULLIF(TRIM(CONCAT_WS(' ', parentp.tup_first_name, parentp.tup_last_name)), ''),
      'tup_parent_username', parentp.tup_username,
      'tup_parent_sponsorship_number', parentp.tup_sponsorship_number,
      'tup_created_at', p.tup_created_at,
      'tup_updated_at', p.tup_updated_at
    ) AS profile_data,
    v_total_count
  FROM tbl_users u
  LEFT JOIN tbl_user_profiles p ON u.tu_id = p.tup_user_id
  LEFT JOIN tbl_user_profiles parentp
    ON (
      LOWER(parentp.tup_sponsorship_number) = LOWER(p.tup_parent_account)
      OR LOWER(parentp.tup_sponsorship_number) = LOWER(REGEXP_REPLACE(p.tup_parent_account, '^sp', '', 'i'))
    )
  WHERE u.tu_user_type = 'customer'
    AND (
      p_search_term IS NULL OR
      u.tu_email ILIKE '%' || p_search_term || '%' OR
      p.tup_first_name ILIKE '%' || p_search_term || '%' OR
      p.tup_last_name ILIKE '%' || p_search_term || '%' OR
      p.tup_username ILIKE '%' || p_search_term || '%' OR
      p.tup_sponsorship_number ILIKE '%' || p_search_term || '%'
    )
    AND (
      v_status_filter = 'all' OR
      (v_status_filter IN ('disabled', 'inactive') AND COALESCE(u.tu_is_active, false) = false) OR
      (v_status_filter = 'active' AND public.is_user_active_member(u.tu_id)) OR
      (
        v_status_filter = 'pending'
        AND COALESCE(u.tu_is_active, false) = true
        AND NOT public.is_user_active_member(u.tu_id)
      )
    )
    AND (
      v_verification_filter = 'all' OR
      (
        v_verification_filter = 'verified'
        AND public.meets_current_verification_requirements(u.tu_email_verified, u.tu_mobile_verified)
      ) OR
      (
        v_verification_filter = 'unverified'
        AND NOT public.meets_current_verification_requirements(u.tu_email_verified, u.tu_mobile_verified)
      )
    )
    AND (
      v_dummy_filter = 'all' OR
      (v_dummy_filter = 'real' AND COALESCE(u.tu_is_dummy, false) = false) OR
      (v_dummy_filter = 'dummy' AND COALESCE(u.tu_is_dummy, false) = true)
    )
  ORDER BY u.tu_created_at DESC
  OFFSET p_offset
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_customers(TEXT, TEXT, TEXT, INT, INT, TEXT) TO authenticated, anon, service_role;

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
    COALESCE(SUM(CASE WHEN nt.level = 1 AND public.is_user_active_member(nt.tup_user_id) THEN 1 ELSE 0 END), 0)::int AS level1_count,
    COALESCE(SUM(CASE WHEN nt.level = 2 AND public.is_user_active_member(nt.tup_user_id) THEN 1 ELSE 0 END), 0)::int AS level2_count,
    COALESCE(SUM(CASE WHEN nt.level = 3 AND public.is_user_active_member(nt.tup_user_id) THEN 1 ELSE 0 END), 0)::int AS level3_count
  FROM sponsor
  LEFT JOIN network_tree nt ON true
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
        WHEN tree.level = p_level AND public.is_user_active_member(tree.tup_user_id) THEN 1
        ELSE 0
      END
    ),
    0
  )::int AS level_count
FROM tree
GROUP BY tree.root_sponsor
$sql$;

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
  IF NOT public.is_user_active_member(p_user_id) THEN
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
  IF NOT public.is_user_active_member(p_user_id) THEN
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

-- Referral network RPCs must also follow current verification settings.
DROP FUNCTION IF EXISTS public.get_referral_network_v1(uuid, int);
DROP FUNCTION IF EXISTS public.get_referral_network_page_v1(uuid, int, int, text, int, int);

CREATE OR REPLACE FUNCTION public.get_referral_network_v1(
  p_user_id uuid,
  p_max_levels int DEFAULT 10
)
RETURNS TABLE (
  user_id uuid,
  parent_user_id uuid,
  level int,
  sponsorship_number text,
  parent_account text,
  is_active boolean,
  is_registration_paid boolean,
  email_verified boolean,
  mobile_verified boolean,
  is_active_member boolean,
  email text,
  first_name text,
  last_name text,
  username text
)
SECURITY DEFINER
SET search_path = public
LANGUAGE sql
AS $sql$
WITH RECURSIVE root AS (
  SELECT
    up.tup_user_id AS root_user_id,
    CASE
      WHEN lower(btrim(up.tup_sponsorship_number)) LIKE 'sp%' THEN substr(lower(btrim(up.tup_sponsorship_number)), 3)
      ELSE lower(btrim(up.tup_sponsorship_number))
    END AS root_sponsorship_norm
  FROM tbl_user_profiles up
  WHERE up.tup_user_id = p_user_id
  LIMIT 1
),
network AS (
  SELECT
    child.tup_user_id AS user_id,
    root.root_user_id AS parent_user_id,
    1 AS level,
    btrim(child.tup_sponsorship_number) AS sponsorship_number,
    child.tup_parent_account AS parent_account
  FROM root
  JOIN tbl_user_profiles child
    ON (
      CASE
        WHEN lower(btrim(child.tup_parent_account)) LIKE 'sp%' THEN substr(lower(btrim(child.tup_parent_account)), 3)
        ELSE lower(btrim(child.tup_parent_account))
      END
    ) = root.root_sponsorship_norm
  WHERE child.tup_user_id IS NOT NULL
    AND child.tup_sponsorship_number IS NOT NULL
    AND root.root_sponsorship_norm IS NOT NULL
    AND root.root_sponsorship_norm <> ''
    AND p_max_levels >= 1

  UNION ALL

  SELECT
    child.tup_user_id,
    n.user_id AS parent_user_id,
    n.level + 1,
    btrim(child.tup_sponsorship_number),
    child.tup_parent_account
  FROM network n
  JOIN tbl_user_profiles child
    ON (
      CASE
        WHEN lower(btrim(child.tup_parent_account)) LIKE 'sp%' THEN substr(lower(btrim(child.tup_parent_account)), 3)
        ELSE lower(btrim(child.tup_parent_account))
      END
    ) = (
      CASE
        WHEN lower(btrim(n.sponsorship_number)) LIKE 'sp%' THEN substr(lower(btrim(n.sponsorship_number)), 3)
        ELSE lower(btrim(n.sponsorship_number))
      END
    )
  WHERE n.level < LEAST(50, GREATEST(1, p_max_levels))
    AND child.tup_user_id IS NOT NULL
    AND child.tup_sponsorship_number IS NOT NULL
)
SELECT
  n.user_id,
  n.parent_user_id,
  n.level,
  n.sponsorship_number,
  n.parent_account,
  COALESCE(u.tu_is_active, false) AS is_active,
  COALESCE(u.tu_registration_paid, false) AS is_registration_paid,
  COALESCE(u.tu_email_verified, false) AS email_verified,
  COALESCE(u.tu_mobile_verified, false) AS mobile_verified,
  public.is_user_active_member(n.user_id) AS is_active_member,
  u.tu_email AS email,
  p.tup_first_name AS first_name,
  p.tup_last_name AS last_name,
  p.tup_username AS username
FROM network n
LEFT JOIN tbl_users u ON u.tu_id = n.user_id
LEFT JOIN tbl_user_profiles p ON p.tup_user_id = n.user_id
WHERE n.user_id <> p_user_id
ORDER BY n.level, n.sponsorship_number
$sql$;

GRANT EXECUTE ON FUNCTION public.get_referral_network_v1(uuid, int) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_referral_network_page_v1(
  p_user_id uuid,
  p_max_levels int DEFAULT 10,
  p_level int DEFAULT NULL,
  p_search_term text DEFAULT NULL,
  p_offset int DEFAULT 0,
  p_limit int DEFAULT 50
)
RETURNS TABLE (
  user_id uuid,
  parent_user_id uuid,
  level int,
  sponsorship_number text,
  parent_account text,
  parent_sponsorship_number text,
  is_active boolean,
  is_registration_paid boolean,
  email_verified boolean,
  mobile_verified boolean,
  is_active_member boolean,
  email text,
  first_name text,
  last_name text,
  username text,
  total_count int,
  direct_referrals int,
  max_depth int
)
SECURITY DEFINER
SET search_path = public
LANGUAGE sql
AS $sql$
WITH RECURSIVE root AS (
  SELECT
    up.tup_user_id AS root_user_id,
    btrim(up.tup_sponsorship_number) AS root_sponsorship,
    CASE
      WHEN lower(btrim(up.tup_sponsorship_number)) LIKE 'sp%' THEN substr(lower(btrim(up.tup_sponsorship_number)), 3)
      ELSE lower(btrim(up.tup_sponsorship_number))
    END AS root_sponsorship_norm
  FROM tbl_user_profiles up
  WHERE up.tup_user_id = p_user_id
  LIMIT 1
),
params AS (
  SELECT
    LEAST(50, GREATEST(1, COALESCE(p_max_levels, 10)))::int AS max_levels,
    CASE
      WHEN p_level IS NULL THEN NULL::int
      WHEN p_level < 1 THEN NULL::int
      ELSE LEAST(50, p_level)::int
    END AS level_filter,
    NULLIF(btrim(COALESCE(p_search_term, '')), '') AS search_term,
    GREATEST(0, COALESCE(p_offset, 0))::int AS offset_rows,
    LEAST(200, GREATEST(1, COALESCE(p_limit, 50)))::int AS limit_rows
),
network AS (
  SELECT
    child.tup_user_id AS user_id,
    root.root_user_id AS parent_user_id,
    1 AS level,
    btrim(child.tup_sponsorship_number) AS sponsorship_number,
    child.tup_parent_account AS parent_account,
    root.root_sponsorship AS parent_sponsorship_number
  FROM root
  JOIN params ON true
  JOIN tbl_user_profiles child
    ON (
      CASE
        WHEN lower(btrim(child.tup_parent_account)) LIKE 'sp%' THEN substr(lower(btrim(child.tup_parent_account)), 3)
        ELSE lower(btrim(child.tup_parent_account))
      END
    ) = root.root_sponsorship_norm
  WHERE child.tup_user_id IS NOT NULL
    AND child.tup_sponsorship_number IS NOT NULL
    AND root.root_sponsorship_norm IS NOT NULL
    AND root.root_sponsorship_norm <> ''
    AND params.max_levels >= 1

  UNION ALL

  SELECT
    child.tup_user_id,
    n.user_id AS parent_user_id,
    n.level + 1,
    btrim(child.tup_sponsorship_number),
    child.tup_parent_account,
    n.sponsorship_number AS parent_sponsorship_number
  FROM network n
  JOIN root ON true
  JOIN params ON true
  JOIN tbl_user_profiles child
    ON (
      CASE
        WHEN lower(btrim(child.tup_parent_account)) LIKE 'sp%' THEN substr(lower(btrim(child.tup_parent_account)), 3)
        ELSE lower(btrim(child.tup_parent_account))
      END
    ) = (
      CASE
        WHEN lower(btrim(n.sponsorship_number)) LIKE 'sp%' THEN substr(lower(btrim(n.sponsorship_number)), 3)
        ELSE lower(btrim(n.sponsorship_number))
      END
    )
  WHERE n.level < LEAST(params.max_levels, COALESCE(params.level_filter, params.max_levels))
    AND child.tup_user_id IS NOT NULL
    AND child.tup_sponsorship_number IS NOT NULL
),
network_enriched AS (
  SELECT
    n.user_id,
    n.parent_user_id,
    n.level,
    n.sponsorship_number,
    n.parent_account,
    n.parent_sponsorship_number,
    COALESCE(u.tu_is_active, false) AS is_active,
    COALESCE(u.tu_registration_paid, false) AS is_registration_paid,
    COALESCE(u.tu_email_verified, false) AS email_verified,
    COALESCE(u.tu_mobile_verified, false) AS mobile_verified,
    public.is_user_active_member(n.user_id) AS is_active_member,
    u.tu_email AS email,
    p.tup_first_name AS first_name,
    p.tup_last_name AS last_name,
    p.tup_username AS username
  FROM network n
  LEFT JOIN tbl_users u ON u.tu_id = n.user_id
  LEFT JOIN tbl_user_profiles p ON p.tup_user_id = n.user_id
  WHERE n.user_id <> p_user_id
),
network_filtered AS (
  SELECT ne.*
  FROM network_enriched ne
  JOIN params ON true
  WHERE (params.level_filter IS NULL OR ne.level = params.level_filter)
    AND (
      params.search_term IS NULL
      OR lower(COALESCE(ne.sponsorship_number, '')) LIKE '%' || lower(params.search_term) || '%'
      OR lower(COALESCE(ne.username, '')) LIKE '%' || lower(params.search_term) || '%'
      OR lower(COALESCE(ne.email, '')) LIKE '%' || lower(params.search_term) || '%'
      OR lower(COALESCE(ne.first_name, '')) LIKE '%' || lower(params.search_term) || '%'
      OR lower(COALESCE(ne.last_name, '')) LIKE '%' || lower(params.search_term) || '%'
    )
),
summary AS (
  SELECT
    COALESCE(COUNT(*), 0)::int AS total_count,
    COALESCE(SUM(CASE WHEN level = 1 THEN 1 ELSE 0 END), 0)::int AS direct_referrals,
    COALESCE(MAX(level), 0)::int AS max_depth
  FROM network_enriched
)
SELECT
  nf.user_id,
  nf.parent_user_id,
  nf.level,
  nf.sponsorship_number,
  nf.parent_account,
  nf.parent_sponsorship_number,
  nf.is_active,
  nf.is_registration_paid,
  nf.email_verified,
  nf.mobile_verified,
  nf.is_active_member,
  nf.email,
  nf.first_name,
  nf.last_name,
  nf.username,
  summary.total_count,
  summary.direct_referrals,
  summary.max_depth
FROM network_filtered nf
CROSS JOIN summary
JOIN params ON true
ORDER BY nf.level, nf.sponsorship_number
LIMIT (SELECT limit_rows FROM params) OFFSET (SELECT offset_rows FROM params)
$sql$;

GRANT EXECUTE ON FUNCTION public.get_referral_network_page_v1(uuid, int, int, text, int, int) TO authenticated, service_role;
