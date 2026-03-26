-- Add MLM level counts and reward milestones

ALTER TABLE tbl_wallet_transactions
  DROP CONSTRAINT IF EXISTS tbl_wallet_transactions_twt_reference_type_check;

ALTER TABLE tbl_wallet_transactions
  ADD CONSTRAINT tbl_wallet_transactions_twt_reference_type_check
  CHECK (
    twt_reference_type IN (
      'task_reward',
      'coupon_share',
      'social_share',
      'admin_credit',
      'withdrawal',
      'deposit',
      'transfer',
      'registration_parent_income',
      'registration_payment',
      'mlm_level_reward_5_15_30',
      'mlm_level_reward_15_45_90',
      'mlm_level_reward'
    )
  );

CREATE TABLE IF NOT EXISTS tbl_mlm_level_counts (
  tmlc_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tmlc_user_id uuid NOT NULL REFERENCES tbl_users ON DELETE CASCADE,
  tmlc_sponsorship_number text NOT NULL,
  tmlc_level1_count integer NOT NULL DEFAULT 0,
  tmlc_level2_count integer NOT NULL DEFAULT 0,
  tmlc_level3_count integer NOT NULL DEFAULT 0,
  tmlc_updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT tbl_mlm_level_counts_user_unique UNIQUE (tmlc_user_id),
  CONSTRAINT tbl_mlm_level_counts_sponsorship_unique UNIQUE (tmlc_sponsorship_number)
);

CREATE INDEX IF NOT EXISTS idx_tbl_mlm_level_counts_user_id
  ON tbl_mlm_level_counts (tmlc_user_id);

CREATE INDEX IF NOT EXISTS idx_tbl_mlm_level_counts_sponsorship
  ON tbl_mlm_level_counts (tmlc_sponsorship_number);

ALTER TABLE tbl_mlm_level_counts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access" ON tbl_mlm_level_counts;
CREATE POLICY "service_role_full_access" ON tbl_mlm_level_counts
  AS PERMISSIVE
  FOR ALL
  TO authenticated, anon
  USING ((SELECT ((current_setting('request.jwt.claims'::text, true))::json ->> 'role'::text)) = 'service_role'::text);

DROP POLICY IF EXISTS "super_admin_full_access" ON tbl_mlm_level_counts;
CREATE POLICY "super_admin_full_access" ON tbl_mlm_level_counts
    AS PERMISSIVE
    FOR ALL
    USING (is_super_admin())
    WITH CHECK (is_super_admin());


DROP POLICY IF EXISTS "sub_admin_select" ON tbl_mlm_level_counts;
CREATE POLICY "sub_admin_select" ON tbl_mlm_level_counts
  AS PERMISSIVE
  FOR SELECT
  USING (is_super_admin());

GRANT SELECT ON tbl_mlm_level_counts TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON tbl_mlm_level_counts TO service_role;

CREATE TABLE IF NOT EXISTS tbl_mlm_reward_milestones (
  tmm_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tmm_title text NOT NULL,
  tmm_level1_required integer NOT NULL,
  tmm_level2_required integer NOT NULL,
  tmm_level3_required integer NOT NULL,
  tmm_reward_amount numeric(18, 8) NOT NULL,
  tmm_currency text NOT NULL DEFAULT 'USDT',
  tmm_is_active boolean NOT NULL DEFAULT true,
  tmm_created_at timestamp with time zone DEFAULT now(),
  tmm_updated_at timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tbl_mlm_reward_milestones_active
  ON tbl_mlm_reward_milestones (tmm_is_active);

ALTER TABLE tbl_mlm_reward_milestones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access" ON tbl_mlm_reward_milestones;
CREATE POLICY "service_role_full_access" ON tbl_mlm_reward_milestones
  AS PERMISSIVE
  FOR ALL
  TO authenticated, anon
  USING ((SELECT ((current_setting('request.jwt.claims'::text, true))::json ->> 'role'::text)) = 'service_role'::text);

DROP POLICY IF EXISTS "super_admin_full_access" ON tbl_mlm_reward_milestones;
CREATE POLICY "super_admin_full_access" ON tbl_mlm_reward_milestones
  AS PERMISSIVE
  FOR ALL
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS "sub_admin_select" ON tbl_mlm_reward_milestones;
CREATE POLICY "sub_admin_select" ON tbl_mlm_reward_milestones
  AS PERMISSIVE
  FOR SELECT
  USING  (is_super_admin());

GRANT SELECT ON tbl_mlm_reward_milestones TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON tbl_mlm_reward_milestones TO service_role;

INSERT INTO tbl_mlm_reward_milestones (
  tmm_title,
  tmm_level1_required,
  tmm_level2_required,
  tmm_level3_required,
  tmm_reward_amount,
  tmm_currency,
  tmm_is_active
)
SELECT * FROM (
  VALUES
    ('Level reward for 5 direct / 15 level-2 / 30 level-3 members', 5, 15, 30, 50, 'USDT', true),
    ('Level reward for 15 direct / 45 level-2 / 90 level-3 members', 15, 45, 90, 100, 'USDT', true)
) AS v(title, l1, l2, l3, amount, currency, active)
WHERE NOT EXISTS (
  SELECT 1 FROM tbl_mlm_reward_milestones
);

CREATE OR REPLACE FUNCTION get_upline_sponsorships(
  p_child_sponsorship text,
  p_max_levels integer DEFAULT 3
) RETURNS TABLE(level integer, sponsorship_number text, user_id uuid)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH RECURSIVE upline AS (
    SELECT
      1 as level,
      up.tup_parent_account as sponsorship_number
    FROM tbl_user_profiles up
    WHERE up.tup_sponsorship_number = p_child_sponsorship
      AND up.tup_parent_account IS NOT NULL

    UNION ALL

    SELECT
      u.level + 1,
      up.tup_parent_account
    FROM upline u
    JOIN tbl_user_profiles up
      ON up.tup_sponsorship_number = u.sponsorship_number
    WHERE u.level < p_max_levels
      AND up.tup_parent_account IS NOT NULL
  )
  SELECT u.level, u.sponsorship_number, p.tup_user_id
  FROM upline u
  JOIN tbl_user_profiles p
    ON p.tup_sponsorship_number = u.sponsorship_number;
END;
$$;

GRANT EXECUTE ON FUNCTION get_upline_sponsorships(text, integer) TO authenticated, service_role;

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
LANGUAGE plpgsql
AS $$
DECLARE
  v_user_id uuid;
  v_level1 integer := 0;
  v_level2 integer := 0;
  v_level3 integer := 0;
BEGIN
  SELECT tup_user_id INTO v_user_id
  FROM tbl_user_profiles
  WHERE tup_sponsorship_number = p_sponsorship_number;

  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  WITH RECURSIVE network_tree AS (
    SELECT
      up.tup_user_id,
      up.tup_sponsorship_number,
      up.tup_parent_account,
      1 as level
    FROM tbl_user_profiles up
    JOIN tbl_users u ON u.tu_id = up.tup_user_id
    WHERE up.tup_parent_account = p_sponsorship_number
      AND u.tu_is_active = true
      AND u.tu_registration_paid = true

    UNION ALL

    SELECT
      up.tup_user_id,
      up.tup_sponsorship_number,
      up.tup_parent_account,
      nt.level + 1
    FROM tbl_user_profiles up
    JOIN tbl_users u ON u.tu_id = up.tup_user_id
    INNER JOIN network_tree nt
      ON up.tup_parent_account = nt.tup_sponsorship_number
    WHERE nt.level < 3
      AND u.tu_is_active = true
      AND u.tu_registration_paid = true
  )
  SELECT
    COALESCE(SUM(CASE WHEN level = 1 THEN 1 ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN level = 2 THEN 1 ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN level = 3 THEN 1 ELSE 0 END), 0)
  INTO v_level1, v_level2, v_level3
  FROM network_tree;

  INSERT INTO tbl_mlm_level_counts (
    tmlc_user_id,
    tmlc_sponsorship_number,
    tmlc_level1_count,
    tmlc_level2_count,
    tmlc_level3_count,
    tmlc_updated_at
  ) VALUES (
    v_user_id,
    p_sponsorship_number,
    v_level1,
    v_level2,
    v_level3,
    now()
  )
  ON CONFLICT (tmlc_user_id) DO UPDATE
  SET
    tmlc_sponsorship_number = EXCLUDED.tmlc_sponsorship_number,
    tmlc_level1_count = EXCLUDED.tmlc_level1_count,
    tmlc_level2_count = EXCLUDED.tmlc_level2_count,
    tmlc_level3_count = EXCLUDED.tmlc_level3_count,
    tmlc_updated_at = now();

  RETURN QUERY SELECT v_user_id, v_level1, v_level2, v_level3;
END;
$$;

GRANT EXECUTE ON FUNCTION upsert_mlm_level_counts(text) TO authenticated, service_role;
