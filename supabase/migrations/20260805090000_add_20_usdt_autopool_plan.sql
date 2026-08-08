-- Add the standalone 20 USDT four-by-four matrix product.

ALTER TABLE public.tbl_subscription_plans
  ADD COLUMN IF NOT EXISTS tsp_product_code text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_subscription_plans_product_code
  ON public.tbl_subscription_plans (tsp_product_code)
  WHERE tsp_product_code IS NOT NULL;

DO $$
DECLARE
  v_plan_id uuid;
BEGIN
  SELECT tsp_id INTO v_plan_id
  FROM public.tbl_subscription_plans
  WHERE tsp_product_code = 'autopool_20'
  LIMIT 1;

  IF v_plan_id IS NULL THEN
    INSERT INTO public.tbl_subscription_plans (
      tsp_name,
      tsp_description,
      tsp_price,
      tsp_duration_days,
      tsp_features,
      tsp_is_active,
      tsp_type,
      tsp_plan_phase,
      tsp_product_code
    ) VALUES (
      'AutoPool Matrix',
      '',
      20.00,
      36500,
      '["One-time 20 USDT subscription", "Separate top-to-bottom, left-to-right matrix", "Eight matrix levels", "Milestone rewards are subject to available funds and applicable laws"]'::jsonb,
      true,
      'upgrade',
      'prelaunch',
      'autopool_20'
    );
  ELSE
    UPDATE public.tbl_subscription_plans
    SET tsp_is_active = true,
        tsp_price = 20.00,
        tsp_type = 'upgrade',
        tsp_plan_phase = 'prelaunch'
    WHERE tsp_id = v_plan_id;
  END IF;
END $$;

ALTER TABLE public.tbl_wallet_transactions
  DROP CONSTRAINT IF EXISTS tbl_wallet_transactions_twt_reference_type_check;

DO $$
DECLARE
  v_allowed text[] := ARRAY[
    'task_reward', 'coupon_share', 'social_share', 'admin_credit', 'withdrawal',
    'admin_working_test', 'admin_non_working_test', 'deposit', 'transfer',
    'registration_parent_income',
    'registration_parent_income_reserved', 'upgrade_from_reserved',
    'registration_payment', 'mlm_level_reward_5_15_30',
    'mlm_level_reward_15_45_90', 'mlm_level_reward', 'mlm_level_reward_reserved',
    'spin_wheel_prize', 'spin_wheel_prize_expired', 'reward_coupon',
    'roi_level_income', 'joining_commission', 'autopool_20_milestone'
  ];
  v_existing text[];
BEGIN
  SELECT array_agg(DISTINCT twt_reference_type)
  INTO v_existing
  FROM public.tbl_wallet_transactions
  WHERE twt_reference_type IS NOT NULL;

  v_allowed := v_allowed || COALESCE(v_existing, ARRAY[]::text[]);

  EXECUTE format(
    'ALTER TABLE public.tbl_wallet_transactions ADD CONSTRAINT tbl_wallet_transactions_twt_reference_type_check CHECK (twt_reference_type = ANY (%L::text[]))',
    v_allowed
  );
END $$;

CREATE TABLE IF NOT EXISTS public.tbl_autopool_20_memberships (
  ta20_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ta20_user_id uuid NOT NULL REFERENCES public.tbl_users(tu_id) ON DELETE CASCADE,
  ta20_subscription_id uuid NOT NULL REFERENCES public.tbl_user_subscriptions(tus_id) ON DELETE CASCADE,
  ta20_position bigint NOT NULL UNIQUE,
  ta20_level integer NOT NULL CHECK (ta20_level BETWEEN 0 AND 8),
  ta20_parent_id uuid REFERENCES public.tbl_autopool_20_memberships(ta20_id),
  ta20_ancestor_ids uuid[] NOT NULL DEFAULT '{}',
  ta20_created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tbl_autopool_20_memberships_user_once UNIQUE (ta20_user_id),
  CONSTRAINT tbl_autopool_20_memberships_subscription_once UNIQUE (ta20_subscription_id)
);

CREATE INDEX IF NOT EXISTS idx_autopool_20_memberships_ancestors
  ON public.tbl_autopool_20_memberships USING gin (ta20_ancestor_ids);

ALTER TABLE public.tbl_autopool_20_memberships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS autopool_20_memberships_read_own ON public.tbl_autopool_20_memberships;
CREATE POLICY autopool_20_memberships_read_own
  ON public.tbl_autopool_20_memberships FOR SELECT TO authenticated
  USING (ta20_user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.tbl_autopool_20_milestone_rewards (
  ta20mr_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ta20mr_membership_id uuid NOT NULL REFERENCES public.tbl_autopool_20_memberships(ta20_id) ON DELETE CASCADE,
  ta20mr_level integer NOT NULL CHECK (ta20mr_level BETWEEN 1 AND 8),
  ta20mr_required_members bigint NOT NULL,
  ta20mr_amount numeric(18, 6) NOT NULL,
  ta20mr_wallet_transaction_id uuid REFERENCES public.tbl_wallet_transactions(twt_id) ON DELETE SET NULL,
  ta20mr_created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ta20mr_membership_id, ta20mr_level)
);

ALTER TABLE public.tbl_autopool_20_milestone_rewards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS autopool_20_rewards_read_own ON public.tbl_autopool_20_milestone_rewards;
CREATE POLICY autopool_20_rewards_read_own
  ON public.tbl_autopool_20_milestone_rewards FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.tbl_autopool_20_memberships m
      WHERE m.ta20_id = ta20mr_membership_id
        AND m.ta20_user_id = auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION public.is_autopool_20_plan(p_plan_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tbl_subscription_plans
    WHERE tsp_id = p_plan_id AND tsp_product_code = 'autopool_20' AND tsp_is_active = true
  );
$$;

CREATE OR REPLACE FUNCTION public.user_has_active_same_plan_package(
  p_user_id uuid,
  p_plan_id uuid,
  p_exclude_subscription_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH target_plan AS (
    SELECT
      sp.tsp_id,
      round(COALESCE(sp.tsp_price, 0)::numeric, 6) AS plan_amount,
      COALESCE(sp.tsp_plan_phase, 'prelaunch') AS plan_phase,
      COALESCE(sp.tsp_product_code, '') AS product_code
    FROM public.tbl_subscription_plans sp
    WHERE sp.tsp_id = p_plan_id
  )
  SELECT EXISTS (
    SELECT 1
    FROM public.tbl_user_subscriptions us
    JOIN public.tbl_subscription_plans sp ON sp.tsp_id = us.tus_plan_id
    CROSS JOIN target_plan target
    WHERE us.tus_user_id = p_user_id
      AND (p_exclude_subscription_id IS NULL OR us.tus_id <> p_exclude_subscription_id)
      AND (
        (
          target.product_code = 'autopool_20'
          AND us.tus_plan_id = target.tsp_id
          AND us.tus_status IN ('active', 'upgraded')
          AND (us.tus_end_date IS NULL OR us.tus_end_date > now())
        )
        OR (
          target.product_code <> 'autopool_20'
          AND COALESCE(sp.tsp_product_code, '') <> 'autopool_20'
          AND public.is_subscription_earning_active(us.tus_id)
          AND (
            us.tus_plan_id = target.tsp_id
            OR (
              COALESCE(us.tus_plan_phase, sp.tsp_plan_phase, 'prelaunch') = target.plan_phase
              AND round(COALESCE(us.tus_payment_amount, sp.tsp_price, 0)::numeric, 6) = target.plan_amount
            )
          )
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.user_has_higher_active_earning_package(
  p_user_id uuid,
  p_plan_id uuid,
  p_exclude_subscription_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT CASE WHEN public.is_autopool_20_plan(p_plan_id) THEN false ELSE EXISTS (
    SELECT 1
    FROM public.tbl_user_subscriptions us
    JOIN public.tbl_subscription_plans sp ON sp.tsp_id = us.tus_plan_id
    WHERE us.tus_user_id = p_user_id
      AND public.is_subscription_earning_active(us.tus_id)
      AND COALESCE(sp.tsp_product_code, '') <> 'autopool_20'
      AND (p_exclude_subscription_id IS NULL OR us.tus_id <> p_exclude_subscription_id)
      AND COALESCE(us.tus_payment_amount, sp.tsp_price, 0) > (
        SELECT COALESCE(tsp_price, 0) FROM public.tbl_subscription_plans WHERE tsp_id = p_plan_id
      )
  ) END;
$$;

CREATE OR REPLACE FUNCTION public.create_autopool_20_payment(
  p_user_id uuid,
  p_plan_id uuid,
  p_amount numeric,
  p_currency text DEFAULT 'USDT',
  p_payment_method text DEFAULT 'blockchain',
  p_payment_status text DEFAULT 'completed',
  p_transaction_id text DEFAULT NULL,
  p_gateway_response jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_subscription_id uuid;
  v_payment_id uuid;
  v_amount numeric;
  v_purchase_check jsonb;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'User mismatch';
  END IF;

  SELECT tsp_price INTO v_amount
  FROM public.tbl_subscription_plans
  WHERE tsp_id = p_plan_id AND tsp_product_code = 'autopool_20' AND tsp_is_active = true;

  IF v_amount IS NULL OR round(COALESCE(p_amount, 0), 6) <> round(v_amount, 6) THEN
    RAISE EXCEPTION 'Invalid AutoPool plan or amount';
  END IF;

  IF lower(COALESCE(p_payment_status, '')) <> 'completed' THEN
    RAISE EXCEPTION 'AutoPool payment is not completed';
  END IF;

  v_purchase_check := public.can_purchase_subscription_plan(p_user_id, p_plan_id);
  IF COALESCE((v_purchase_check ->> 'allowed')::boolean, false) = false THEN
    RAISE EXCEPTION '%', COALESCE(v_purchase_check ->> 'message', 'AutoPool plan purchase is not allowed');
  END IF;

  IF p_transaction_id IS NOT NULL THEN
    SELECT tp_id, tp_subscription_id INTO v_payment_id, v_subscription_id
    FROM public.tbl_payments WHERE tp_transaction_id = p_transaction_id LIMIT 1;
    IF v_payment_id IS NOT NULL THEN
      RETURN jsonb_build_object('success', true, 'payment_id', v_payment_id, 'subscription_id', v_subscription_id, 'deduped', true);
    END IF;
  END IF;

  INSERT INTO public.tbl_user_subscriptions (
    tus_user_id, tus_plan_id, tus_status, tus_start_date, tus_end_date,
    tus_payment_amount, tus_plan_phase, tus_package_kind
  ) VALUES (
    p_user_id, p_plan_id, 'active', now(), now() + interval '36500 days',
    v_amount, 'prelaunch', 'upgrade'
  ) RETURNING tus_id INTO v_subscription_id;

  INSERT INTO public.tbl_payments (
    tp_user_id, tp_subscription_id, tp_amount, tp_currency, tp_payment_method,
    tp_payment_status, tp_transaction_id, tp_gateway_response
  ) VALUES (
    p_user_id, v_subscription_id, v_amount, COALESCE(p_currency, 'USDT'),
    COALESCE(p_payment_method, 'blockchain'), COALESCE(p_payment_status, 'completed'),
    p_transaction_id, COALESCE(p_gateway_response, '{}'::jsonb) || jsonb_build_object('product_code', 'autopool_20')
  ) RETURNING tp_id INTO v_payment_id;

  RETURN jsonb_build_object('success', true, 'payment_id', v_payment_id, 'subscription_id', v_subscription_id, 'deduped', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.place_autopool_20_membership()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_position bigint;
  v_parent_position bigint;
  v_parent public.tbl_autopool_20_memberships%ROWTYPE;
  v_level integer;
  v_capacity bigint;
  v_ancestor uuid[] := '{}';
  v_membership_id uuid;
  v_ancestor_id uuid;
  v_ancestor_level integer;
  v_reward_level integer;
  v_required bigint;
  v_amount numeric;
  v_wallet_id uuid;
  v_wallet_tx_id uuid;
  v_reward_id uuid;
BEGIN
  IF NOT public.is_autopool_20_plan(NEW.tus_plan_id) OR NEW.tus_status NOT IN ('active', 'upgraded') THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('autopool_20_global', 0));
  SELECT COALESCE(MAX(ta20_position) + 1, 0) INTO v_position FROM public.tbl_autopool_20_memberships;

  IF v_position = 0 THEN
    v_level := 0;
  ELSE
    v_level := 1;
    v_capacity := 4;
    WHILE v_position > v_capacity LOOP
      v_level := v_level + 1;
      v_capacity := v_capacity + power(4, v_level)::bigint;
    END LOOP;
  END IF;

  IF v_level > 8 THEN
    RAISE EXCEPTION 'The 20 USDT AutoPool matrix is full';
  END IF;

  IF v_position > 0 THEN
    v_parent_position := floor((v_position - 1) / 4);
    SELECT * INTO v_parent FROM public.tbl_autopool_20_memberships WHERE ta20_position = v_parent_position FOR UPDATE;
    v_ancestor := v_parent.ta20_ancestor_ids || v_parent.ta20_id;
  END IF;

  INSERT INTO public.tbl_autopool_20_memberships (
    ta20_user_id, ta20_subscription_id, ta20_position, ta20_level, ta20_parent_id, ta20_ancestor_ids
  ) VALUES (
    NEW.tus_user_id, NEW.tus_id, v_position, v_level,
    CASE WHEN v_position = 0 THEN NULL ELSE v_parent.ta20_id END, v_ancestor
  ) RETURNING ta20_id INTO v_membership_id;

  FOREACH v_ancestor_id IN ARRAY v_ancestor LOOP
    SELECT ta20_level INTO v_ancestor_level FROM public.tbl_autopool_20_memberships WHERE ta20_id = v_ancestor_id;
    FOR v_reward_level IN 1..8 LOOP
      IF v_ancestor_level + v_reward_level > 8 THEN CONTINUE; END IF;
      v_required := power(4, v_reward_level)::bigint;
      IF (SELECT count(*) FROM public.tbl_autopool_20_memberships m
          WHERE v_ancestor_id = ANY(m.ta20_ancestor_ids)
            AND m.ta20_level = v_ancestor_level + v_reward_level) = v_required THEN
        v_amount := CASE v_reward_level
          WHEN 1 THEN 1 WHEN 2 THEN 8 WHEN 3 THEN 32 WHEN 4 THEN 128
          WHEN 5 THEN 512 WHEN 6 THEN 1024 WHEN 7 THEN 4096 WHEN 8 THEN 16384
        END;
        v_reward_id := NULL;
        INSERT INTO public.tbl_autopool_20_milestone_rewards (
          ta20mr_membership_id, ta20mr_level, ta20mr_required_members, ta20mr_amount
        ) VALUES (v_ancestor_id, v_reward_level, v_required, v_amount)
        ON CONFLICT DO NOTHING
        RETURNING ta20mr_id INTO v_reward_id;

        IF v_reward_id IS NOT NULL THEN
          SELECT public.ensure_working_wallet(m.ta20_user_id) INTO v_wallet_id
          FROM public.tbl_autopool_20_memberships m WHERE m.ta20_id = v_ancestor_id;
          INSERT INTO public.tbl_wallet_transactions (
            twt_wallet_id, twt_user_id, twt_transaction_type, twt_amount, twt_currency,
            twt_description, twt_status, twt_reference_type, twt_reference_id
          ) SELECT v_wallet_id, w.tw_user_id, 'credit', v_amount, 'USDT',
            '20 USDT AutoPool level ' || v_reward_level || ' milestone', 'completed',
            'autopool_20_milestone', v_reward_id
          FROM public.tbl_wallets w WHERE w.tw_id = v_wallet_id
          RETURNING twt_id INTO v_wallet_tx_id;
          UPDATE public.tbl_wallets SET tw_balance = COALESCE(tw_balance, 0) + v_amount, tw_updated_at = now()
          WHERE tw_id = v_wallet_id;
          UPDATE public.tbl_autopool_20_milestone_rewards SET ta20mr_wallet_transaction_id = v_wallet_tx_id
          WHERE ta20mr_id = v_reward_id;
        END IF;
      END IF;
    END LOOP;
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_place_autopool_20_membership ON public.tbl_user_subscriptions;
CREATE TRIGGER trg_place_autopool_20_membership
AFTER INSERT ON public.tbl_user_subscriptions
FOR EACH ROW EXECUTE FUNCTION public.place_autopool_20_membership();

GRANT EXECUTE ON FUNCTION public.create_autopool_20_payment(uuid, uuid, numeric, text, text, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_autopool_20_plan(uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.create_autopool_20_payment(uuid, uuid, numeric, text, text, text, text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_autopool_20_plan(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.place_autopool_20_membership() FROM PUBLIC;
NOTIFY pgrst, 'reload schema';
