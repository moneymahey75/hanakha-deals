-- Customer referral network RPC based on sponsorship relationships (`tbl_user_profiles.tup_parent_account`).
-- Returns downline nodes with correct relative levels:
-- - direct children => level 1
-- - grandchildren => level 2, etc.
-- Matching is case-insensitive and tolerates optional "SP" prefix differences.
--
-- Implemented as a SQL-language function with no semicolons inside the dollar-quoted body
-- to support migration runners that incorrectly split on semicolons.

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

