-- Show each downline customer's active Launch package in My Network.

DROP FUNCTION IF EXISTS public.get_referral_network_page_v1(uuid, int, int, text, int, int);

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
    (
      COALESCE(u.tu_is_active, false)
      AND COALESCE(u.tu_registration_paid, false)
      AND public.meets_current_verification_requirements(u.tu_email_verified, u.tu_mobile_verified)
    ) AS is_active_member,
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
    alp.subscribed_package_name,
    alp.subscribed_package_amount
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

GRANT EXECUTE ON FUNCTION public.get_referral_network_page_v1(uuid, int, int, text, int, int)
TO authenticated, service_role;
