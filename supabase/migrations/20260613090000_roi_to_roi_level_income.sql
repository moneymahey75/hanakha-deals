-- ROI-to-ROI level income.
-- When a customer earns coupon ROI, eligible uplines receive percentage income
-- from that credited ROI amount into their ROI/reward wallet.

ALTER TABLE public.tbl_wallet_transactions
  DROP CONSTRAINT IF EXISTS tbl_wallet_transactions_twt_reference_type_check;

ALTER TABLE public.tbl_wallet_transactions
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
      'registration_parent_income_reserved',
      'upgrade_from_reserved',
      'registration_payment',
      'mlm_level_reward_5_15_30',
      'mlm_level_reward_15_45_90',
      'mlm_level_reward',
      'mlm_level_reward_reserved',
      'spin_wheel_prize',
      'reward_coupon',
      'joining_commission',
      'roi_level_income'
    )
  );

CREATE TABLE IF NOT EXISTS public.tbl_roi_level_incomes (
  trli_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trli_assignment_id uuid NOT NULL REFERENCES public.tbl_user_reward_coupons(turc_id) ON DELETE CASCADE,
  trli_source_user_id uuid NOT NULL REFERENCES public.tbl_users(tu_id) ON DELETE CASCADE,
  trli_recipient_user_id uuid NOT NULL REFERENCES public.tbl_users(tu_id) ON DELETE CASCADE,
  trli_level integer NOT NULL CHECK (trli_level BETWEEN 1 AND 15),
  trli_source_reward_amount numeric(18, 6) NOT NULL CHECK (trli_source_reward_amount >= 0),
  trli_percentage numeric(9, 6) NOT NULL CHECK (trli_percentage > 0),
  trli_income_amount numeric(18, 6) NOT NULL CHECK (trli_income_amount >= 0),
  trli_required_directs integer NOT NULL CHECK (trli_required_directs >= 0),
  trli_directs_at_award integer NOT NULL DEFAULT 0 CHECK (trli_directs_at_award >= 0),
  trli_max_eligible_level integer NOT NULL DEFAULT 0 CHECK (trli_max_eligible_level >= 0),
  trli_status text NOT NULL DEFAULT 'credited' CHECK (trli_status IN ('credited', 'locked', 'skipped')),
  trli_skip_reason text,
  trli_wallet_transaction_id uuid REFERENCES public.tbl_wallet_transactions(twt_id) ON DELETE SET NULL,
  trli_created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tbl_roi_level_incomes_assignment_level_recipient_unique
    UNIQUE (trli_assignment_id, trli_level, trli_recipient_user_id)
);

CREATE INDEX IF NOT EXISTS idx_roi_level_incomes_recipient_created
  ON public.tbl_roi_level_incomes (trli_recipient_user_id, trli_created_at DESC);

CREATE INDEX IF NOT EXISTS idx_roi_level_incomes_source_created
  ON public.tbl_roi_level_incomes (trli_source_user_id, trli_created_at DESC);

ALTER TABLE public.tbl_roi_level_incomes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access" ON public.tbl_roi_level_incomes;
CREATE POLICY "service_role_full_access"
  ON public.tbl_roi_level_incomes
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "user_select_own_roi_level_incomes" ON public.tbl_roi_level_incomes;
CREATE POLICY "user_select_own_roi_level_incomes"
  ON public.tbl_roi_level_incomes
  FOR SELECT
  TO authenticated
  USING (trli_recipient_user_id = auth.uid() OR trli_source_user_id = auth.uid());

DROP POLICY IF EXISTS "admin_read_roi_level_incomes" ON public.tbl_roi_level_incomes;
CREATE POLICY "admin_read_roi_level_incomes"
  ON public.tbl_roi_level_incomes
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

GRANT SELECT ON public.tbl_roi_level_incomes TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.tbl_roi_level_incomes TO service_role;

CREATE OR REPLACE FUNCTION public.ensure_reward_wallet(p_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wallet_id uuid;
BEGIN
  SELECT tw_id
    INTO v_wallet_id
  FROM public.tbl_wallets
  WHERE tw_user_id = p_user_id
    AND tw_currency = 'USDT'
    AND tw_wallet_type = 'reward'
  LIMIT 1;

  IF v_wallet_id IS NULL THEN
    INSERT INTO public.tbl_wallets (
      tw_user_id,
      tw_balance,
      tw_currency,
      tw_wallet_type,
      tw_is_active
    ) VALUES (
      p_user_id,
      0,
      'USDT',
      'reward',
      true
    )
    ON CONFLICT (tw_user_id, tw_currency, tw_wallet_type) DO NOTHING
    RETURNING tw_id INTO v_wallet_id;

    IF v_wallet_id IS NULL THEN
      SELECT tw_id
        INTO v_wallet_id
      FROM public.tbl_wallets
      WHERE tw_user_id = p_user_id
        AND tw_currency = 'USDT'
        AND tw_wallet_type = 'reward'
      LIMIT 1;
    END IF;
  END IF;

  RETURN v_wallet_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.ensure_reward_wallet(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_reward_wallet(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.get_user_roi_level_cap(p_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH active_launch_plan AS (
    SELECT MAX(COALESCE(sp.tsp_price, us.tus_payment_amount, 0))::numeric AS plan_amount
    FROM public.tbl_user_subscriptions us
    JOIN public.tbl_subscription_plans sp ON sp.tsp_id = us.tus_plan_id
    WHERE us.tus_user_id = p_user_id
      AND us.tus_status = 'active'
      AND (us.tus_end_date IS NULL OR us.tus_end_date > now())
      AND COALESCE(us.tus_plan_phase, sp.tsp_plan_phase, 'prelaunch') = 'launch'
  )
  SELECT CASE
    WHEN COALESCE(plan_amount, 0) >= 200 THEN 15
    WHEN COALESCE(plan_amount, 0) >= 100 THEN 10
    WHEN COALESCE(plan_amount, 0) >= 50 THEN 7
    ELSE 0
  END
  FROM active_launch_plan;
$$;

REVOKE EXECUTE ON FUNCTION public.get_user_roi_level_cap(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_roi_level_cap(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.award_roi_level_income_for_reward_coupon(p_assignment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assignment record;
  v_coupon record;
  v_source_label text;
  v_level integer;
  v_recipient_id uuid;
  v_percent numeric(9, 6);
  v_required_directs integer;
  v_direct_count integer;
  v_max_level integer;
  v_amount numeric(18, 6);
  v_income_id uuid;
  v_wallet_id uuid;
  v_wallet_tx_id uuid;
  v_credited_count integer := 0;
  v_locked_count integer := 0;
  v_skipped_count integer := 0;
  v_credited_total numeric(18, 6) := 0;
BEGIN
  SELECT
    rc.*,
    up.tup_sponsorship_number,
    up.tup_first_name,
    up.tup_last_name,
    u.tu_email
  INTO v_assignment
  FROM public.tbl_user_reward_coupons rc
  JOIN public.tbl_users u ON u.tu_id = rc.turc_user_id
  LEFT JOIN public.tbl_user_profiles up ON up.tup_user_id = rc.turc_user_id
  WHERE rc.turc_id = p_assignment_id;

  IF v_assignment.turc_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'assignment_not_found');
  END IF;

  IF COALESCE(v_assignment.turc_reward_amount, 0) <= 0 THEN
    RETURN jsonb_build_object('success', false, 'reason', 'empty_source_reward');
  END IF;

  SELECT * INTO v_coupon
  FROM public.tbl_coupons
  WHERE tc_id = v_assignment.turc_coupon_id;

  v_source_label := COALESCE(
    NULLIF(trim(v_assignment.tup_sponsorship_number), ''),
    NULLIF(trim(concat_ws(' ', v_assignment.tup_first_name, v_assignment.tup_last_name)), ''),
    NULLIF(trim(v_assignment.tu_email), ''),
    v_assignment.turc_user_id::text
  );

  FOR v_level, v_recipient_id, v_percent, v_required_directs IN
    WITH RECURSIVE uplines AS (
      SELECT
        1 AS level,
        parent.tu_id AS recipient_user_id
      FROM public.tbl_users source_user
      JOIN public.tbl_users parent ON parent.tu_id = source_user.tu_referrer_id
      WHERE source_user.tu_id = v_assignment.turc_user_id

      UNION ALL

      SELECT
        u.level + 1,
        parent.tu_id
      FROM uplines u
      JOIN public.tbl_users upline_user ON upline_user.tu_id = u.recipient_user_id
      JOIN public.tbl_users parent ON parent.tu_id = upline_user.tu_referrer_id
      WHERE u.level < 15
    )
    SELECT
      u.level,
      u.recipient_user_id,
      CASE
        WHEN u.level = 1 THEN 10
        WHEN u.level = 2 THEN 5
        WHEN u.level = 3 THEN 3
        WHEN u.level = 4 THEN 2
        WHEN u.level BETWEEN 5 AND 9 THEN 1
        WHEN u.level = 10 THEN 2
        WHEN u.level IN (11, 12) THEN 1
        WHEN u.level BETWEEN 13 AND 15 THEN 2
      END::numeric(9, 6) AS percent,
      LEAST(u.level, 9)::integer AS required_directs
    FROM uplines u
    JOIN public.tbl_users recipient ON recipient.tu_id = u.recipient_user_id
    WHERE COALESCE(recipient.tu_is_active, false) = true
      AND COALESCE(recipient.tu_registration_paid, false) = true
    ORDER BY u.level
  LOOP
    v_income_id := NULL;
    v_wallet_tx_id := NULL;
    v_direct_count := public.count_paid_direct_joins(v_recipient_id);
    v_max_level := public.get_user_roi_level_cap(v_recipient_id);
    v_amount := ROUND((v_assignment.turc_reward_amount * v_percent / 100)::numeric, 6);

    IF v_amount <= 0 THEN
      INSERT INTO public.tbl_roi_level_incomes (
        trli_assignment_id,
        trli_source_user_id,
        trli_recipient_user_id,
        trli_level,
        trli_source_reward_amount,
        trli_percentage,
        trli_income_amount,
        trli_required_directs,
        trli_directs_at_award,
        trli_max_eligible_level,
        trli_status,
        trli_skip_reason
      ) VALUES (
        p_assignment_id,
        v_assignment.turc_user_id,
        v_recipient_id,
        v_level,
        v_assignment.turc_reward_amount,
        v_percent,
        0,
        v_required_directs,
        v_direct_count,
        v_max_level,
        'skipped',
        'zero_income_amount'
      )
      ON CONFLICT (trli_assignment_id, trli_level, trli_recipient_user_id) DO NOTHING;

      v_skipped_count := v_skipped_count + 1;
      CONTINUE;
    END IF;

    IF v_max_level < v_level THEN
      INSERT INTO public.tbl_roi_level_incomes (
        trli_assignment_id,
        trli_source_user_id,
        trli_recipient_user_id,
        trli_level,
        trli_source_reward_amount,
        trli_percentage,
        trli_income_amount,
        trli_required_directs,
        trli_directs_at_award,
        trli_max_eligible_level,
        trli_status,
        trli_skip_reason
      ) VALUES (
        p_assignment_id,
        v_assignment.turc_user_id,
        v_recipient_id,
        v_level,
        v_assignment.turc_reward_amount,
        v_percent,
        v_amount,
        v_required_directs,
        v_direct_count,
        v_max_level,
        'locked',
        'plan_level_cap_not_met'
      )
      ON CONFLICT (trli_assignment_id, trli_level, trli_recipient_user_id) DO NOTHING;

      v_locked_count := v_locked_count + 1;
      CONTINUE;
    END IF;

    IF v_direct_count < v_required_directs THEN
      INSERT INTO public.tbl_roi_level_incomes (
        trli_assignment_id,
        trli_source_user_id,
        trli_recipient_user_id,
        trli_level,
        trli_source_reward_amount,
        trli_percentage,
        trli_income_amount,
        trli_required_directs,
        trli_directs_at_award,
        trli_max_eligible_level,
        trli_status,
        trli_skip_reason
      ) VALUES (
        p_assignment_id,
        v_assignment.turc_user_id,
        v_recipient_id,
        v_level,
        v_assignment.turc_reward_amount,
        v_percent,
        v_amount,
        v_required_directs,
        v_direct_count,
        v_max_level,
        'locked',
        'direct_join_requirement_not_met'
      )
      ON CONFLICT (trli_assignment_id, trli_level, trli_recipient_user_id) DO NOTHING;

      v_locked_count := v_locked_count + 1;
      CONTINUE;
    END IF;

    INSERT INTO public.tbl_roi_level_incomes (
      trli_assignment_id,
      trli_source_user_id,
      trli_recipient_user_id,
      trli_level,
      trli_source_reward_amount,
      trli_percentage,
      trli_income_amount,
      trli_required_directs,
      trli_directs_at_award,
      trli_max_eligible_level,
      trli_status
    ) VALUES (
      p_assignment_id,
      v_assignment.turc_user_id,
      v_recipient_id,
      v_level,
      v_assignment.turc_reward_amount,
      v_percent,
      v_amount,
      v_required_directs,
      v_direct_count,
      v_max_level,
      'credited'
    )
    ON CONFLICT (trli_assignment_id, trli_level, trli_recipient_user_id) DO NOTHING
    RETURNING trli_id INTO v_income_id;

    IF v_income_id IS NULL THEN
      CONTINUE;
    END IF;

    v_wallet_id := public.ensure_reward_wallet(v_recipient_id);

    INSERT INTO public.tbl_wallet_transactions (
      twt_wallet_id,
      twt_user_id,
      twt_transaction_type,
      twt_amount,
      twt_currency,
      twt_description,
      twt_status,
      twt_reference_type,
      twt_reference_id,
      twt_created_at
    ) VALUES (
      v_wallet_id,
      v_recipient_id,
      'credit',
      v_amount,
      'USDT',
      'Level ' || v_level || ' ROI income from ' || v_source_label || ': ' || COALESCE(v_coupon.tc_title, 'Coupon'),
      'completed',
      'roi_level_income',
      v_income_id,
      now()
    )
    RETURNING twt_id INTO v_wallet_tx_id;

    UPDATE public.tbl_wallets
    SET
      tw_balance = COALESCE(tw_balance, 0) + v_amount,
      tw_updated_at = now()
    WHERE tw_id = v_wallet_id;

    UPDATE public.tbl_roi_level_incomes
    SET trli_wallet_transaction_id = v_wallet_tx_id
    WHERE trli_id = v_income_id;

    v_credited_count := v_credited_count + 1;
    v_credited_total := v_credited_total + v_amount;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'assignment_id', p_assignment_id,
    'credited_count', v_credited_count,
    'locked_count', v_locked_count,
    'skipped_count', v_skipped_count,
    'credited_total', v_credited_total
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.award_roi_level_income_for_reward_coupon(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.award_roi_level_income_for_reward_coupon(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.rate_reward_coupon(
  p_assignment_id uuid,
  p_rating integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_assignment record;
  v_coupon record;
  v_wallet_id uuid;
  v_balance numeric;
  v_transaction_id uuid;
  v_rating integer := COALESCE(p_rating, 0);
  v_roi_level_result jsonb := '{}'::jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF v_rating NOT BETWEEN 1 AND 5 THEN
    RAISE EXCEPTION 'Select a rating from 1 to 5 stars';
  END IF;

  SELECT * INTO v_assignment
  FROM public.tbl_user_reward_coupons
  WHERE turc_id = p_assignment_id
    AND turc_user_id = v_user_id
  FOR UPDATE;

  IF v_assignment.turc_id IS NULL THEN
    RAISE EXCEPTION 'Coupon assignment not found';
  END IF;

  IF v_assignment.turc_status IN ('liked', 'disliked') THEN
    RETURN jsonb_build_object(
      'status', v_assignment.turc_status,
      'reaction', v_assignment.turc_reaction,
      'rating', v_assignment.turc_rating,
      'reacted_at', v_assignment.turc_reacted_at,
      'reward_credited', false,
      'reward_amount', v_assignment.turc_reward_amount,
      'roi_level_income', v_roi_level_result
    );
  END IF;

  IF v_assignment.turc_status <> 'opened' THEN
    RAISE EXCEPTION 'Open this coupon before rating it';
  END IF;

  IF v_assignment.turc_reaction IS NULL THEN
    RAISE EXCEPTION 'Choose like or dislike before rating this coupon';
  END IF;

  IF v_assignment.turc_site_visited_at IS NULL THEN
    RAISE EXCEPTION 'Visit the coupon site before submitting a rating';
  END IF;

  IF now() < v_assignment.turc_site_visited_at + interval '5 seconds' THEN
    RAISE EXCEPTION 'Please wait 5 seconds after visiting the site';
  END IF;

  SELECT * INTO v_coupon
  FROM public.tbl_coupons
  WHERE tc_id = v_assignment.turc_coupon_id;

  v_wallet_id := public.ensure_reward_wallet(v_user_id);

  SELECT tw_balance INTO v_balance
  FROM public.tbl_wallets
  WHERE tw_id = v_wallet_id
  FOR UPDATE;

  INSERT INTO public.tbl_wallet_transactions (
    twt_wallet_id,
    twt_user_id,
    twt_transaction_type,
    twt_amount,
    twt_currency,
    twt_description,
    twt_reference_type,
    twt_reference_id,
    twt_status
  )
  VALUES (
    v_wallet_id,
    v_user_id,
    'credit',
    v_assignment.turc_reward_amount,
    'USDT',
    'Daily reward coupon completed: ' || COALESCE(v_coupon.tc_title, 'Coupon'),
    'reward_coupon',
    p_assignment_id,
    'completed'
  )
  ON CONFLICT DO NOTHING
  RETURNING twt_id INTO v_transaction_id;

  IF v_transaction_id IS NOT NULL THEN
    UPDATE public.tbl_wallets
    SET
      tw_balance = COALESCE(tw_balance, 0) + v_assignment.turc_reward_amount,
      tw_updated_at = now()
    WHERE tw_id = v_wallet_id;

    v_roi_level_result := public.award_roi_level_income_for_reward_coupon(p_assignment_id);
  END IF;

  UPDATE public.tbl_user_reward_coupons
  SET
    turc_status = v_assignment.turc_reaction,
    turc_rating = v_rating,
    turc_reacted_at = now()
  WHERE turc_id = p_assignment_id
  RETURNING * INTO v_assignment;

  RETURN jsonb_build_object(
    'status', v_assignment.turc_status,
    'reaction', v_assignment.turc_reaction,
    'rating', v_assignment.turc_rating,
    'reacted_at', v_assignment.turc_reacted_at,
    'reward_credited', v_transaction_id IS NOT NULL,
    'reward_amount', v_assignment.turc_reward_amount,
    'roi_level_income', v_roi_level_result
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.rate_reward_coupon(uuid, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rate_reward_coupon(uuid, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.rate_reward_coupon(uuid, integer) TO authenticated;
