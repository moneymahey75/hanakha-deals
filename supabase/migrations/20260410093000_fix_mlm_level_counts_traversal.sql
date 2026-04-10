-- Fix MLM level counts logic:
-- - Traverse the sponsorship graph regardless of intermediate member payment/active status
-- - Only count members that are active + registration paid
-- - Compare sponsorship/parent_account case-insensitively with trimming
--
-- Note: implemented as a SQL-language function (not PL/pgSQL) to avoid migration runners
-- that split statements on semicolons and break dollar-quoted bodies.

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
    COALESCE(SUM(CASE WHEN nt.level = 1 AND u.tu_is_active = true AND u.tu_registration_paid = true THEN 1 ELSE 0 END), 0)::int AS level1_count,
    COALESCE(SUM(CASE WHEN nt.level = 2 AND u.tu_is_active = true AND u.tu_registration_paid = true THEN 1 ELSE 0 END), 0)::int AS level2_count,
    COALESCE(SUM(CASE WHEN nt.level = 3 AND u.tu_is_active = true AND u.tu_registration_paid = true THEN 1 ELSE 0 END), 0)::int AS level3_count
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
