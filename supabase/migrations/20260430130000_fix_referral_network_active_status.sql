-- Fix "Active member" status in referral network RPCs.
-- Active member should require: user is active + registration paid + mobile verified.
--
-- Implemented as SQL-language functions with no semicolons inside the dollar-quoted body
-- to support migration runners that incorrectly split on semicolons.

-- NOTE: We change the return type (add columns), so we must drop first.
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
  COALESCE(u.tu_mobile_verified, false) AS mobile_verified,
  (COALESCE(u.tu_is_active, false) AND COALESCE(u.tu_registration_paid, false) AND COALESCE(u.tu_mobile_verified, false)) AS is_active_member,
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
    COALESCE(u.tu_mobile_verified, false) AS mobile_verified,
    (COALESCE(u.tu_is_active, false) AND COALESCE(u.tu_registration_paid, false) AND COALESCE(u.tu_mobile_verified, false)) AS is_active_member,
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
  SELECT
    ne.*
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
