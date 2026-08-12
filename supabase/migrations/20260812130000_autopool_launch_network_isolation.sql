-- Keep AutoPool Matrix isolated from launch-plan network counts and income criteria.

CREATE OR REPLACE FUNCTION public.has_active_launch_plan_subscription(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tbl_user_subscriptions us
    JOIN public.tbl_subscription_plans sp ON sp.tsp_id = us.tus_plan_id
    WHERE us.tus_user_id = p_user_id
      AND us.tus_status IN ('active', 'upgraded')
      AND us.tus_exhausted_at IS NULL
      AND (us.tus_end_date IS NULL OR us.tus_end_date > now())
      AND COALESCE(us.tus_plan_phase, sp.tsp_plan_phase, 'prelaunch') = 'launch'
      AND COALESCE(sp.tsp_product_code, '') <> 'autopool_20'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_autopool_only_member(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_active_autopool_20_subscription(p_user_id)
    AND NOT public.has_active_launch_plan_subscription(p_user_id);
$$;

CREATE OR REPLACE FUNCTION public.is_launch_plan_network_member(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_valid_roi_direct_customer(p_user_id);
$$;

CREATE OR REPLACE FUNCTION public.counts_for_launch_plan_network(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_launch_plan_network_member(p_user_id)
    OR (
      NOT public.is_autopool_only_member(p_user_id)
      AND EXISTS (
        SELECT 1
        FROM public.tbl_users u
        WHERE u.tu_id = p_user_id
          AND COALESCE(u.tu_is_active, false) = true
          AND COALESCE(u.tu_registration_paid, false) = true
          AND public.meets_current_verification_requirements(u.tu_email_verified, u.tu_mobile_verified)
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.upsert_mlm_level_counts(
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
WITH sponsor AS (
  SELECT
    up.tup_user_id AS user_id,
    btrim(up.tup_sponsorship_number) AS sponsorship_number
  FROM public.tbl_user_profiles up
  WHERE public.normalize_sponsorship_key(up.tup_sponsorship_number)
    = public.normalize_sponsorship_key(p_sponsorship_number)
  LIMIT 1
),
counts AS (
  SELECT
    sponsor.user_id,
    sponsor.sponsorship_number,
    COALESCE(COUNT(*) FILTER (
      WHERE c.trc_depth = 1
        AND public.counts_for_launch_plan_network(c.trc_descendant_user_id)
    ), 0)::int AS level1_count,
    COALESCE(COUNT(*) FILTER (
      WHERE c.trc_depth = 2
        AND public.counts_for_launch_plan_network(c.trc_descendant_user_id)
    ), 0)::int AS level2_count,
    COALESCE(COUNT(*) FILTER (
      WHERE c.trc_depth = 3
        AND public.counts_for_launch_plan_network(c.trc_descendant_user_id)
    ), 0)::int AS level3_count
  FROM sponsor
  LEFT JOIN public.tbl_referral_closure c
    ON c.trc_ancestor_user_id = sponsor.user_id
   AND c.trc_depth BETWEEN 1 AND 3
  WHERE sponsor.user_id IS NOT NULL
  GROUP BY sponsor.user_id, sponsor.sponsorship_number
),
upserted AS (
  INSERT INTO public.tbl_mlm_level_counts (
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

CREATE OR REPLACE FUNCTION public.recompute_all_mlm_level_counts()
RETURNS integer
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_rows integer := 0;
BEGIN
  PERFORM public.rebuild_referral_closure();

  INSERT INTO public.tbl_mlm_level_counts (
    tmlc_user_id,
    tmlc_sponsorship_number,
    tmlc_level1_count,
    tmlc_level2_count,
    tmlc_level3_count,
    tmlc_updated_at
  )
  SELECT
    up.tup_user_id,
    up.tup_sponsorship_number,
    COALESCE(COUNT(*) FILTER (
      WHERE c.trc_depth = 1
        AND public.counts_for_launch_plan_network(c.trc_descendant_user_id)
    ), 0)::int,
    COALESCE(COUNT(*) FILTER (
      WHERE c.trc_depth = 2
        AND public.counts_for_launch_plan_network(c.trc_descendant_user_id)
    ), 0)::int,
    COALESCE(COUNT(*) FILTER (
      WHERE c.trc_depth = 3
        AND public.counts_for_launch_plan_network(c.trc_descendant_user_id)
    ), 0)::int,
    now()
  FROM public.tbl_user_profiles up
  LEFT JOIN public.tbl_referral_closure c
    ON c.trc_ancestor_user_id = up.tup_user_id
   AND c.trc_depth BETWEEN 1 AND 3
  WHERE up.tup_user_id IS NOT NULL
    AND up.tup_sponsorship_number IS NOT NULL
    AND btrim(up.tup_sponsorship_number) <> ''
  GROUP BY up.tup_user_id, up.tup_sponsorship_number
  ON CONFLICT (tmlc_user_id) DO UPDATE
  SET
    tmlc_sponsorship_number = EXCLUDED.tmlc_sponsorship_number,
    tmlc_level1_count = EXCLUDED.tmlc_level1_count,
    tmlc_level2_count = EXCLUDED.tmlc_level2_count,
    tmlc_level3_count = EXCLUDED.tmlc_level3_count,
    tmlc_updated_at = now();

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_mlm_level_counts_for_sponsors_at_level(
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
WITH seed AS (
  SELECT DISTINCT public.normalize_sponsorship_key(s) AS sponsor_key
  FROM unnest(p_sponsorship_numbers) AS s
  WHERE public.normalize_sponsorship_key(s) IS NOT NULL
),
sponsors AS (
  SELECT
    up.tup_user_id,
    public.normalize_sponsorship_key(up.tup_sponsorship_number) AS sponsor_key,
    btrim(up.tup_sponsorship_number) AS sponsorship_number
  FROM public.tbl_user_profiles up
  JOIN seed ON seed.sponsor_key = public.normalize_sponsorship_key(up.tup_sponsorship_number)
)
SELECT
  sponsors.sponsorship_number AS sponsorship_number,
  COALESCE(COUNT(*) FILTER (
    WHERE c.trc_depth = LEAST(100, GREATEST(1, COALESCE(p_level, 1)))
      AND public.counts_for_launch_plan_network(c.trc_descendant_user_id)
  ), 0)::int AS level_count
FROM sponsors
LEFT JOIN public.tbl_referral_closure c
  ON c.trc_ancestor_user_id = sponsors.tup_user_id
 AND c.trc_depth = LEAST(100, GREATEST(1, COALESCE(p_level, 1)))
GROUP BY sponsors.sponsorship_number
$sql$;

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
  mobile_verified boolean,
  is_active_member boolean,
  has_autopool_membership boolean,
  is_autopool_only_member boolean,
  email text,
  first_name text,
  last_name text,
  username text
)
SECURITY DEFINER
SET search_path = public
LANGUAGE sql
AS $sql$
SELECT
  c.trc_descendant_user_id AS user_id,
  direct_parent.trc_ancestor_user_id AS parent_user_id,
  c.trc_depth AS level,
  p.tup_sponsorship_number AS sponsorship_number,
  p.tup_parent_account AS parent_account,
  COALESCE(u.tu_is_active, false) AS is_active,
  COALESCE(u.tu_registration_paid, false) AS is_registration_paid,
  COALESCE(u.tu_mobile_verified, false) AS mobile_verified,
  public.is_launch_plan_network_member(c.trc_descendant_user_id) AS is_active_member,
  public.has_active_autopool_20_subscription(c.trc_descendant_user_id) AS has_autopool_membership,
  public.is_autopool_only_member(c.trc_descendant_user_id) AS is_autopool_only_member,
  u.tu_email AS email,
  p.tup_first_name AS first_name,
  p.tup_last_name AS last_name,
  p.tup_username AS username
FROM public.tbl_referral_closure c
LEFT JOIN public.tbl_referral_closure direct_parent
  ON direct_parent.trc_descendant_user_id = c.trc_descendant_user_id
 AND direct_parent.trc_depth = 1
LEFT JOIN public.tbl_users u ON u.tu_id = c.trc_descendant_user_id
LEFT JOIN public.tbl_user_profiles p ON p.tup_user_id = c.trc_descendant_user_id
WHERE c.trc_ancestor_user_id = p_user_id
  AND c.trc_depth <= LEAST(100, GREATEST(1, COALESCE(p_max_levels, 10)))
ORDER BY c.trc_depth, p.tup_sponsorship_number
$sql$;

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
  mobile_verified boolean,
  is_active_member boolean,
  has_autopool_membership boolean,
  is_autopool_only_member boolean,
  email text,
  first_name text,
  last_name text,
  username text,
  subscribed_package_name text,
  subscribed_package_amount numeric,
  total_count int,
  direct_referrals int,
  max_depth int
)
SECURITY DEFINER
SET search_path = public
LANGUAGE sql
AS $sql$
WITH params AS (
  SELECT
    LEAST(100, GREATEST(1, COALESCE(p_max_levels, 10)))::int AS max_levels,
    CASE
      WHEN p_level IS NULL OR p_level < 1 THEN NULL::int
      ELSE LEAST(100, p_level)::int
    END AS level_filter,
    NULLIF(btrim(COALESCE(p_search_term, '')), '') AS search_term,
    GREATEST(0, COALESCE(p_offset, 0))::int AS offset_rows,
    LEAST(100, GREATEST(1, COALESCE(p_limit, 50)))::int AS limit_rows
),
network_enriched AS (
  SELECT
    c.trc_descendant_user_id AS user_id,
    direct_parent.trc_ancestor_user_id AS parent_user_id,
    c.trc_depth AS level,
    p.tup_sponsorship_number AS sponsorship_number,
    p.tup_parent_account AS parent_account,
    parent_profile.tup_sponsorship_number AS parent_sponsorship_number,
    COALESCE(u.tu_is_active, false) AS is_active,
    COALESCE(u.tu_registration_paid, false) AS is_registration_paid,
    COALESCE(u.tu_mobile_verified, false) AS mobile_verified,
    public.is_launch_plan_network_member(c.trc_descendant_user_id) AS is_active_member,
    public.has_active_autopool_20_subscription(c.trc_descendant_user_id) AS has_autopool_membership,
    public.is_autopool_only_member(c.trc_descendant_user_id) AS is_autopool_only_member,
    u.tu_email AS email,
    p.tup_first_name AS first_name,
    p.tup_last_name AS last_name,
    p.tup_username AS username
  FROM public.tbl_referral_closure c
  JOIN params ON true
  LEFT JOIN public.tbl_referral_closure direct_parent
    ON direct_parent.trc_descendant_user_id = c.trc_descendant_user_id
   AND direct_parent.trc_depth = 1
  LEFT JOIN public.tbl_user_profiles parent_profile
    ON parent_profile.tup_user_id = direct_parent.trc_ancestor_user_id
  LEFT JOIN public.tbl_users u
    ON u.tu_id = c.trc_descendant_user_id
  LEFT JOIN public.tbl_user_profiles p
    ON p.tup_user_id = c.trc_descendant_user_id
  WHERE c.trc_ancestor_user_id = p_user_id
    AND c.trc_depth <= params.max_levels
),
active_launch_package_candidates AS (
  SELECT
    us.tus_user_id AS package_user_id,
    NULLIF(btrim(sp.tsp_name), '') AS package_name,
    GREATEST(COALESCE(us.tus_payment_amount, 0), COALESCE(sp.tsp_price, 0))::numeric AS package_amount,
    us.tus_start_date,
    us.tus_id,
    ROW_NUMBER() OVER (
      PARTITION BY us.tus_user_id, NULLIF(btrim(sp.tsp_name), '')
      ORDER BY
        GREATEST(COALESCE(us.tus_payment_amount, 0), COALESCE(sp.tsp_price, 0)) DESC,
        us.tus_start_date DESC NULLS LAST,
        us.tus_id
    ) AS package_name_rank
  FROM public.tbl_user_subscriptions us
  JOIN public.tbl_subscription_plans sp
    ON sp.tsp_id = us.tus_plan_id
  JOIN network_enriched ne
    ON ne.user_id = us.tus_user_id
  WHERE us.tus_status IN ('active', 'upgraded')
    AND us.tus_exhausted_at IS NULL
    AND (us.tus_end_date IS NULL OR us.tus_end_date > now())
    AND COALESCE(us.tus_plan_phase, sp.tsp_plan_phase, 'prelaunch') = 'launch'
    AND COALESCE(sp.tsp_product_code, '') <> 'autopool_20'
),
active_launch_packages AS (
  SELECT
    package_user_id,
    string_agg(
      COALESCE(package_name, 'Launch Package'),
      ', '
      ORDER BY package_amount DESC, tus_start_date DESC NULLS LAST, tus_id
    ) AS subscribed_package_name,
    MAX(package_amount) AS subscribed_package_amount
  FROM active_launch_package_candidates
  WHERE package_name_rank = 1
  GROUP BY package_user_id
),
network_filtered AS (
  SELECT
    ne.*,
    CASE
      WHEN ne.is_autopool_only_member THEN 'AutoPool Matrix'
      ELSE alp.subscribed_package_name
    END AS subscribed_package_name,
    CASE
      WHEN ne.is_autopool_only_member THEN 20::numeric
      ELSE alp.subscribed_package_amount
    END AS subscribed_package_amount
  FROM network_enriched ne
  LEFT JOIN active_launch_packages alp
    ON alp.package_user_id = ne.user_id
  JOIN params ON true
  WHERE (params.level_filter IS NULL OR ne.level = params.level_filter)
    AND (
      params.search_term IS NULL
      OR ne.sponsorship_number ILIKE '%' || params.search_term || '%'
      OR ne.username ILIKE '%' || params.search_term || '%'
      OR ne.email ILIKE '%' || params.search_term || '%'
      OR ne.first_name ILIKE '%' || params.search_term || '%'
      OR ne.last_name ILIKE '%' || params.search_term || '%'
      OR alp.subscribed_package_name ILIKE '%' || params.search_term || '%'
      OR (ne.is_autopool_only_member AND 'autopool matrix' ILIKE '%' || params.search_term || '%')
    )
),
summary AS (
  SELECT
    COALESCE(COUNT(*), 0)::int AS total_count,
    COALESCE(COUNT(*) FILTER (WHERE level = 1), 0)::int AS direct_referrals,
    COALESCE(MAX(level), 0)::int AS max_depth
  FROM network_filtered
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
  nf.mobile_verified,
  nf.is_active_member,
  nf.has_autopool_membership,
  nf.is_autopool_only_member,
  nf.email,
  nf.first_name,
  nf.last_name,
  nf.username,
  nf.subscribed_package_name,
  nf.subscribed_package_amount,
  summary.total_count,
  summary.direct_referrals,
  summary.max_depth
FROM network_filtered nf
CROSS JOIN summary
JOIN params ON true
ORDER BY nf.level, nf.sponsorship_number
LIMIT (SELECT limit_rows FROM params)
OFFSET (SELECT offset_rows FROM params)
$sql$;

CREATE OR REPLACE FUNCTION public.get_referral_network_stats_v1(
  p_user_id uuid,
  p_max_levels int DEFAULT 100
)
RETURNS TABLE (
  total_team int,
  total_direct_referrals int,
  active_direct_referrals int,
  active_team int,
  max_depth int
)
SECURITY DEFINER
SET search_path = public
LANGUAGE sql
AS $sql$
SELECT
  COALESCE(COUNT(*), 0)::int AS total_team,
  COALESCE(COUNT(*) FILTER (WHERE c.trc_depth = 1), 0)::int AS total_direct_referrals,
  COALESCE(COUNT(*) FILTER (
    WHERE c.trc_depth = 1
      AND public.counts_for_launch_plan_network(c.trc_descendant_user_id)
  ), 0)::int AS active_direct_referrals,
  COALESCE(COUNT(*) FILTER (
    WHERE public.counts_for_launch_plan_network(c.trc_descendant_user_id)
  ), 0)::int AS active_team,
  COALESCE(MAX(c.trc_depth), 0)::int AS max_depth
FROM public.tbl_referral_closure c
WHERE c.trc_ancestor_user_id = p_user_id
  AND c.trc_depth <= LEAST(100, GREATEST(1, COALESCE(p_max_levels, 100)))
$sql$;

CREATE OR REPLACE FUNCTION public.update_wallet_balance(
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
  v_reference_type text := COALESCE(p_reference_type, '');
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be greater than zero';
  END IF;

  IF public.is_autopool_only_member(p_user_id)
    AND v_reference_type NOT IN ('autopool_20_milestone', 'autopool_20_direct_income')
  THEN
    RAISE EXCEPTION 'AutoPool-only members are not eligible for launch plan wallet credits';
  END IF;

  IF NOT public.is_user_active_member(p_user_id) THEN
    RAISE EXCEPTION 'Account is not active/verified or registration-paid';
  END IF;

  IF public.is_user_on_launch_plan(p_user_id)
    AND p_transaction_type = 'credit'
    AND v_reference_type IN (
      'task_reward',
      'coupon_share',
      'registration_parent_income',
      'registration_parent_income_reserved',
      'mlm_level_reward',
      'mlm_level_reward_reserved'
    )
  THEN
    RAISE EXCEPTION 'Pre-Launch reward system is disabled for Launch plan users';
  END IF;

  SELECT tw_id, tw_balance
  INTO v_wallet_id, v_current_balance
  FROM public.tbl_wallets
  WHERE tw_user_id = p_user_id
    AND tw_currency = 'USDT'
  ORDER BY CASE WHEN tw_wallet_type = 'working' THEN 0 ELSE 1 END
  LIMIT 1
  FOR UPDATE;

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

  UPDATE public.tbl_wallets
  SET tw_balance = v_new_balance, tw_updated_at = now()
  WHERE tw_id = v_wallet_id;

  INSERT INTO public.tbl_wallet_transactions (
    twt_wallet_id,
    twt_user_id,
    twt_transaction_type,
    twt_amount,
    twt_description,
    twt_reference_type,
    twt_reference_id
  ) VALUES (
    v_wallet_id,
    p_user_id,
    p_transaction_type,
    p_amount,
    p_description,
    p_reference_type,
    p_reference_id
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

CREATE OR REPLACE FUNCTION public.complete_user_task(
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
  v_claims jsonb;
  v_is_service_role boolean := false;
BEGIN
  v_claims := COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
  v_is_service_role := COALESCE(v_claims->>'role', '') = 'service_role';

  IF NOT v_is_service_role AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Not authorized to complete this task';
  END IF;

  IF public.is_autopool_only_member(p_user_id) THEN
    RAISE EXCEPTION 'AutoPool-only members are not eligible for launch plan daily tasks';
  END IF;

  IF NOT public.is_user_active_member(p_user_id) THEN
    RAISE EXCEPTION 'Account is not active/verified or registration-paid';
  END IF;

  SELECT *
  INTO v_task
  FROM public.tbl_daily_tasks
  WHERE tdt_id = p_task_id;

  IF v_task IS NULL THEN
    RAISE EXCEPTION 'Task not found';
  END IF;

  IF v_task.tdt_expires_at <= now() THEN
    RAISE EXCEPTION 'Task has expired';
  END IF;

  SELECT *
  INTO v_user_task
  FROM public.tbl_user_tasks
  WHERE tut_user_id = p_user_id
    AND tut_task_id = p_task_id;

  IF v_user_task IS NULL THEN
    RAISE EXCEPTION 'Task not assigned to user';
  END IF;

  IF v_user_task.tut_completion_status = 'completed' THEN
    RAISE EXCEPTION 'Task already completed';
  END IF;

  UPDATE public.tbl_user_tasks
  SET
    tut_completion_status = 'completed',
    tut_share_url = p_share_url,
    tut_share_platform = p_platform,
    tut_share_screenshot_url = p_screenshot_url,
    tut_completed_at = now(),
    tut_updated_at = now()
  WHERE tut_id = v_user_task.tut_id;

  INSERT INTO public.tbl_social_shares (
    tss_user_id,
    tss_task_id,
    tss_coupon_id,
    tss_platform,
    tss_share_url,
    tss_content_type,
    tss_screenshot_url,
    tss_reward_amount
  ) VALUES (
    p_user_id,
    p_task_id,
    v_task.tdt_coupon_id,
    p_platform,
    p_share_url,
    v_task.tdt_task_type,
    p_screenshot_url,
    v_task.tdt_reward_amount
  );

  SELECT public.update_wallet_balance(
    p_user_id,
    v_task.tdt_reward_amount,
    'credit',
    'Task completion reward: ' || v_task.tdt_title,
    'task_reward',
    p_task_id
  ) INTO v_reward_result;

  UPDATE public.tbl_daily_tasks
  SET tdt_completed_count = tdt_completed_count + 1
  WHERE tdt_id = p_task_id;

  UPDATE public.tbl_user_tasks
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

REVOKE EXECUTE ON FUNCTION public.has_active_launch_plan_subscription(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_autopool_only_member(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_launch_plan_network_member(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.counts_for_launch_plan_network(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.has_active_launch_plan_subscription(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_autopool_only_member(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_launch_plan_network_member(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.counts_for_launch_plan_network(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_referral_network_v1(uuid, int) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_referral_network_page_v1(uuid, int, int, text, int, int) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_referral_network_stats_v1(uuid, int) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.upsert_mlm_level_counts(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.recompute_all_mlm_level_counts() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_mlm_level_counts_for_sponsors_at_level(text[], int) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_wallet_balance(uuid, numeric, text, text, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_user_task(uuid, uuid, text, text, text) TO authenticated, service_role;

SELECT public.recompute_all_mlm_level_counts();

NOTIFY pgrst, 'reload schema';
