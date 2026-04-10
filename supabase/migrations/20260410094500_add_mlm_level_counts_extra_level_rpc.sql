-- RPC helper to compute an exact level count (up to 50) for many sponsors at once.
-- Counts only active + registration paid users, but traverses the graph regardless of intermediate status.

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
        WHEN tree.level = p_level AND u.tu_is_active = true AND u.tu_registration_paid = true THEN 1
        ELSE 0
      END
    ),
    0
  )::int AS level_count
FROM tree
JOIN tbl_users u ON u.tu_id = tree.tup_user_id
GROUP BY tree.root_sponsor
$sql$;

GRANT EXECUTE ON FUNCTION get_mlm_level_counts_for_sponsors_at_level(text[], int) TO authenticated, service_role;
