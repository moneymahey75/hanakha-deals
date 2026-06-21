-- ROI-to-ROI direct-member rule:
-- Levels 1-9 require the same number of valid direct members as the level.
-- Levels 10-15 require at least 10 valid direct members.

DO $patch_roi_required_directs$
DECLARE
  v_function_definition text;
  v_required_directs_sql text := 'CASE
        WHEN u.level BETWEEN 10 AND 15 THEN 10
        ELSE LEAST(u.level, 9)
      END::integer AS required_directs';
BEGIN
  SELECT pg_get_functiondef('public.award_roi_level_income_for_reward_coupon(uuid)'::regprocedure)
  INTO v_function_definition;

  IF v_function_definition IS NULL THEN
    RAISE EXCEPTION 'public.award_roi_level_income_for_reward_coupon(uuid) does not exist';
  END IF;

  v_function_definition := replace(
    v_function_definition,
    'LEAST(u.level, 9)::integer AS required_directs',
    v_required_directs_sql
  );

  EXECUTE v_function_definition;

  SELECT pg_get_functiondef('public.debug_roi_level_income_for_reward_coupon(uuid)'::regprocedure)
  INTO v_function_definition;

  IF v_function_definition IS NOT NULL THEN
    v_function_definition := replace(
      v_function_definition,
      'LEAST(u.level, 9)::integer AS required_directs',
      v_required_directs_sql
    );

    EXECUTE v_function_definition;
  END IF;
END;
$patch_roi_required_directs$;

REVOKE EXECUTE ON FUNCTION public.award_roi_level_income_for_reward_coupon(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.award_roi_level_income_for_reward_coupon(uuid) TO service_role;
