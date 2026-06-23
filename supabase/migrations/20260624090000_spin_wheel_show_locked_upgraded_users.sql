-- Show the active spin wheel campaign to ineligible users too, with a clear
-- restriction message for customers who already upgraded to a launch package.

CREATE OR REPLACE FUNCTION public.customer_get_spin_wheel_status()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_campaign public.tbl_spin_wheel_campaigns%ROWTYPE;
  v_spin public.tbl_spin_wheel_spins%ROWTYPE;
  v_eligible boolean := false;
  v_has_launch_upgrade boolean := false;
  v_restriction_message text := 'Spin wheel is only available for old 5 USDT users before launch upgrade.';
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('active', false, 'hasSpun', false, 'eligible', false, 'message', 'Login required.');
  END IF;

  PERFORM public.expire_spin_wheel_reserved_rewards(v_user_id);

  SELECT public.is_spin_wheel_launch_upgrade_eligible(v_user_id) INTO v_eligible;

  SELECT EXISTS (
    SELECT 1
    FROM public.tbl_user_subscriptions us
    JOIN public.tbl_subscription_plans sp ON sp.tsp_id = us.tus_plan_id
    WHERE us.tus_user_id = v_user_id
      AND COALESCE(us.tus_plan_phase, sp.tsp_plan_phase, 'prelaunch') = 'launch'
      AND us.tus_status IN ('active', 'upgraded')
      AND us.tus_exhausted_at IS NULL
      AND (us.tus_end_date IS NULL OR us.tus_end_date > now())
  )
  INTO v_has_launch_upgrade;

  IF v_has_launch_upgrade THEN
    v_restriction_message := 'You have already upgraded to a launch package, so this pre-upgrade spin reward is locked for your account.';
  END IF;

  SELECT *
  INTO v_spin
  FROM public.tbl_spin_wheel_spins
  WHERE tsws_user_id = v_user_id
  ORDER BY tsws_created_at DESC
  LIMIT 1;

  IF v_spin.tsws_id IS NOT NULL THEN
    PERFORM public.credit_spin_wheel_reward_once(v_spin.tsws_id);

    RETURN jsonb_build_object(
      'active', false,
      'hasSpun', true,
      'eligible', v_eligible,
      'spunAt', v_spin.tsws_created_at,
      'prizeAmount', v_spin.tsws_prize_amount,
      'outcome', v_spin.tsws_outcome,
      'message', 'You have already used your spin.'
    );
  END IF;

  SELECT * INTO v_campaign FROM public.get_active_spin_wheel_campaign();

  IF NOT v_eligible THEN
    RETURN jsonb_build_object(
      'active', v_campaign.tswc_id IS NOT NULL,
      'hasSpun', false,
      'eligible', false,
      'campaignId', v_campaign.tswc_id,
      'campaignName', COALESCE(v_campaign.tswc_name, 'Spin the Wheel'),
      'message', v_restriction_message
    );
  END IF;

  IF v_campaign.tswc_id IS NULL THEN
    RETURN jsonb_build_object('active', false, 'hasSpun', false, 'eligible', true, 'message', 'Spin wheel is not available right now.');
  END IF;

  RETURN jsonb_build_object(
    'active', true,
    'hasSpun', false,
    'eligible', true,
    'campaignId', v_campaign.tswc_id,
    'campaignName', v_campaign.tswc_name,
    'message', 'Spin available.'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.customer_spin_wheel()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_campaign public.tbl_spin_wheel_campaigns%ROWTYPE;
  v_existing_spin public.tbl_spin_wheel_spins%ROWTYPE;
  v_prize_amount numeric(18,8) := 0;
  v_outcome text := 'better_luck';
  v_spin_id uuid;
  v_new_balance numeric(18,8) := 0;
  v_has_launch_upgrade boolean := false;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Login required.';
  END IF;

  IF NOT public.is_spin_wheel_launch_upgrade_eligible(v_user_id) THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.tbl_user_subscriptions us
      JOIN public.tbl_subscription_plans sp ON sp.tsp_id = us.tus_plan_id
      WHERE us.tus_user_id = v_user_id
        AND COALESCE(us.tus_plan_phase, sp.tsp_plan_phase, 'prelaunch') = 'launch'
        AND us.tus_status IN ('active', 'upgraded')
        AND us.tus_exhausted_at IS NULL
        AND (us.tus_end_date IS NULL OR us.tus_end_date > now())
    )
    INTO v_has_launch_upgrade;

    IF v_has_launch_upgrade THEN
      RAISE EXCEPTION 'You have already upgraded to a launch package, so this pre-upgrade spin reward is locked for your account.';
    END IF;

    RAISE EXCEPTION 'Spin wheel is only available for old 5 USDT users before launch upgrade.';
  END IF;

  SELECT * INTO v_existing_spin
  FROM public.tbl_spin_wheel_spins
  WHERE tsws_user_id = v_user_id
  LIMIT 1;

  IF v_existing_spin.tsws_id IS NOT NULL THEN
    v_new_balance := COALESCE(public.credit_spin_wheel_reward_once(v_existing_spin.tsws_id), 0);

    RETURN jsonb_build_object(
      'success', false,
      'hasSpun', true,
      'prizeAmount', v_existing_spin.tsws_prize_amount,
      'outcome', v_existing_spin.tsws_outcome,
      'newBalance', v_new_balance,
      'message', 'You have already used your spin.'
    );
  END IF;

  SELECT * INTO v_campaign FROM public.get_active_spin_wheel_campaign();

  IF v_campaign.tswc_id IS NULL THEN
    RAISE EXCEPTION 'Spin wheel is not available right now.';
  END IF;

  SELECT COALESCE(a.tswa_prize_amount, 0)
  INTO v_prize_amount
  FROM public.tbl_spin_wheel_assignments a
  WHERE a.tswa_campaign_id = v_campaign.tswc_id
    AND a.tswa_user_id = v_user_id
  LIMIT 1;

  v_prize_amount := COALESCE(v_prize_amount, 0);
  v_outcome := CASE WHEN v_prize_amount > 0 THEN 'prize' ELSE 'better_luck' END;

  INSERT INTO public.tbl_spin_wheel_spins (
    tsws_campaign_id,
    tsws_user_id,
    tsws_prize_amount,
    tsws_outcome
  )
  VALUES (
    v_campaign.tswc_id,
    v_user_id,
    v_prize_amount,
    v_outcome
  )
  RETURNING tsws_id INTO v_spin_id;

  IF v_prize_amount > 0 THEN
    v_new_balance := COALESCE(public.credit_spin_wheel_reward_once(v_spin_id), 0);
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'hasSpun', true,
    'campaignId', v_campaign.tswc_id,
    'campaignName', v_campaign.tswc_name,
    'spinId', v_spin_id,
    'prizeAmount', v_prize_amount,
    'outcome', v_outcome,
    'newBalance', v_new_balance,
    'message', CASE
      WHEN v_prize_amount > 0 THEN 'Congratulations! Your spin reward has been added to your reserved wallet for launch upgrade.'
      ELSE 'Better luck next time.'
    END
  );
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object(
      'success', false,
      'hasSpun', true,
      'prizeAmount', 0,
      'outcome', 'better_luck',
      'message', 'You have already used your spin.'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.customer_get_spin_wheel_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.customer_spin_wheel() TO authenticated;
