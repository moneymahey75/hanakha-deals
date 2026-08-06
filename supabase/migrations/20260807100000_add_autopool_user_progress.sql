-- User-facing AutoPool progress, controlled by an admin setting.

INSERT INTO public.tbl_system_settings (
  tss_setting_key,
  tss_setting_value,
  tss_description
)
VALUES (
  'autopool_user_counts_enabled',
  'true',
  'Allow AutoPool members to view their eight matrix-level counts and earned milestones'
)
ON CONFLICT (tss_setting_key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.get_my_autopool_20_progress()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_enabled boolean := true;
  v_membership_id uuid;
  v_position bigint;
  v_member_level integer;
  v_joined_at timestamptz;
  v_levels jsonb := '[]'::jsonb;
  v_total_earned numeric := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT
    CASE
      WHEN s.tss_setting_value IS NULL THEN true
      ELSE LOWER(TRIM(BOTH '"' FROM s.tss_setting_value::text)) IN ('true', '1', 'yes', 'on')
    END
  INTO v_enabled
  FROM public.tbl_system_settings s
  WHERE s.tss_setting_key = 'autopool_user_counts_enabled'
  LIMIT 1;

  v_enabled := COALESCE(v_enabled, true);
  IF NOT v_enabled THEN
    RETURN jsonb_build_object(
      'enabled', false,
      'is_member', false,
      'levels', '[]'::jsonb,
      'total_earned', 0
    );
  END IF;

  SELECT
    m.ta20_id,
    m.ta20_position,
    m.ta20_level,
    m.ta20_created_at
  INTO
    v_membership_id,
    v_position,
    v_member_level,
    v_joined_at
  FROM public.tbl_autopool_20_memberships m
  WHERE m.ta20_user_id = v_user_id
  LIMIT 1;

  IF v_membership_id IS NULL THEN
    RETURN jsonb_build_object(
      'enabled', true,
      'is_member', false,
      'levels', '[]'::jsonb,
      'total_earned', 0
    );
  END IF;

  SELECT COALESCE(SUM(r.ta20mr_amount), 0)
  INTO v_total_earned
  FROM public.tbl_autopool_20_milestone_rewards r
  WHERE r.ta20mr_membership_id = v_membership_id;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'level', progress.level_number,
      'user_count', progress.user_count,
      'required_count', progress.required_count,
      'progress_percent', progress.progress_percent,
      'reward_amount', progress.reward_amount,
      'earned', progress.earned,
      'earned_amount', progress.earned_amount,
      'earned_at', progress.earned_at
    ) ORDER BY progress.level_number
  ), '[]'::jsonb)
  INTO v_levels
  FROM (
    SELECT
      level_number,
      COUNT(descendant.ta20_id)::bigint AS user_count,
      POWER(4, level_number)::bigint AS required_count,
      LEAST(
        100,
        ROUND((COUNT(descendant.ta20_id)::numeric * 100) / POWER(4, level_number)::numeric, 2)
      ) AS progress_percent,
      CASE level_number
        WHEN 1 THEN 1
        WHEN 2 THEN 8
        WHEN 3 THEN 32
        WHEN 4 THEN 128
        WHEN 5 THEN 512
        WHEN 6 THEN 1024
        WHEN 7 THEN 4096
        WHEN 8 THEN 16384
      END::numeric AS reward_amount,
      reward.ta20mr_id IS NOT NULL AS earned,
      COALESCE(reward.ta20mr_amount, 0) AS earned_amount,
      reward.ta20mr_created_at AS earned_at
    FROM generate_series(1, 8) AS levels(level_number)
    LEFT JOIN public.tbl_autopool_20_memberships descendant
      ON v_membership_id = ANY(descendant.ta20_ancestor_ids)
      AND descendant.ta20_level = v_member_level + level_number
    LEFT JOIN public.tbl_autopool_20_milestone_rewards reward
      ON reward.ta20mr_membership_id = v_membership_id
      AND reward.ta20mr_level = level_number
    GROUP BY
      level_number,
      reward.ta20mr_id,
      reward.ta20mr_amount,
      reward.ta20mr_created_at
  ) progress;

  RETURN jsonb_build_object(
    'enabled', true,
    'is_member', true,
    'membership_position', v_position,
    'matrix_level', v_member_level,
    'joined_at', v_joined_at,
    'levels', v_levels,
    'total_earned', v_total_earned
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_autopool_20_progress() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_autopool_20_progress() TO authenticated;

NOTIFY pgrst, 'reload schema';
