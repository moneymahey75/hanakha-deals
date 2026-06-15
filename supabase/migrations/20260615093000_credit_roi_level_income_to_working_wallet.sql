-- Credit ROI-to-ROI level income to the working wallet.
-- Daily ROI coupon income remains in the reward/non-working wallet.

DO $$
DECLARE
  v_function_definition text;
BEGIN
  SELECT pg_get_functiondef('public.award_roi_level_income_for_reward_coupon(uuid)'::regprocedure)
  INTO v_function_definition;

  IF v_function_definition IS NULL THEN
    RAISE EXCEPTION 'public.award_roi_level_income_for_reward_coupon(uuid) does not exist';
  END IF;

  v_function_definition := replace(
    v_function_definition,
    'public.ensure_reward_wallet(v_recipient_id)',
    'public.ensure_working_wallet(v_recipient_id)'
  );

  v_function_definition := replace(
    v_function_definition,
    'ensure_reward_wallet(v_recipient_id)',
    'ensure_working_wallet(v_recipient_id)'
  );

  IF position('ensure_working_wallet(v_recipient_id)' IN v_function_definition) = 0 THEN
    RAISE EXCEPTION 'Could not patch ROI level income wallet target to working wallet';
  END IF;

  EXECUTE v_function_definition;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.award_roi_level_income_for_reward_coupon(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.award_roi_level_income_for_reward_coupon(uuid) TO service_role;
