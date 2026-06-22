-- Launch joining commissions.
-- Level 1: 7% always.
-- Level 2: 1.5% when recipient has at least 3 paid direct joins.
-- Level 3: 1% when recipient has at least 9 paid direct joins.

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
      'joining_commission'
    )
  );

CREATE TABLE IF NOT EXISTS public.tbl_joining_commissions (
  tjc_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tjc_payment_id uuid NOT NULL REFERENCES public.tbl_payments(tp_id) ON DELETE CASCADE,
  tjc_subscription_id uuid REFERENCES public.tbl_user_subscriptions(tus_id) ON DELETE SET NULL,
  tjc_joined_user_id uuid NOT NULL REFERENCES public.tbl_users(tu_id) ON DELETE CASCADE,
  tjc_recipient_user_id uuid NOT NULL REFERENCES public.tbl_users(tu_id) ON DELETE CASCADE,
  tjc_level integer NOT NULL CHECK (tjc_level BETWEEN 1 AND 3),
  tjc_plan_amount numeric(18, 6) NOT NULL CHECK (tjc_plan_amount >= 0),
  tjc_percentage numeric(9, 6) NOT NULL CHECK (tjc_percentage > 0),
  tjc_commission_amount numeric(18, 6) NOT NULL CHECK (tjc_commission_amount >= 0),
  tjc_required_direct_joins integer NOT NULL DEFAULT 0 CHECK (tjc_required_direct_joins >= 0),
  tjc_direct_joins_at_award integer NOT NULL DEFAULT 0 CHECK (tjc_direct_joins_at_award >= 0),
  tjc_status text NOT NULL DEFAULT 'credited' CHECK (tjc_status IN ('credited', 'locked', 'skipped')),
  tjc_skip_reason text,
  tjc_created_at timestamptz NOT NULL DEFAULT now(),
  tjc_wallet_transaction_id uuid REFERENCES public.tbl_wallet_transactions(twt_id) ON DELETE SET NULL,
  CONSTRAINT tbl_joining_commissions_payment_level_recipient_unique
    UNIQUE (tjc_payment_id, tjc_level, tjc_recipient_user_id)
);

ALTER TABLE public.tbl_joining_commissions
  ADD COLUMN IF NOT EXISTS tjc_id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS tjc_payment_id uuid REFERENCES public.tbl_payments(tp_id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS tjc_subscription_id uuid REFERENCES public.tbl_user_subscriptions(tus_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tjc_joined_user_id uuid REFERENCES public.tbl_users(tu_id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS tjc_recipient_user_id uuid REFERENCES public.tbl_users(tu_id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS tjc_level integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS tjc_plan_amount numeric(18, 6) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tjc_percentage numeric(9, 6) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS tjc_commission_amount numeric(18, 6) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tjc_required_direct_joins integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tjc_direct_joins_at_award integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tjc_status text NOT NULL DEFAULT 'credited',
  ADD COLUMN IF NOT EXISTS tjc_skip_reason text,
  ADD COLUMN IF NOT EXISTS tjc_created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS tjc_wallet_transaction_id uuid REFERENCES public.tbl_wallet_transactions(twt_id) ON DELETE SET NULL;

ALTER TABLE public.tbl_joining_commissions
  DROP CONSTRAINT IF EXISTS tbl_joining_commissions_level_check;

ALTER TABLE public.tbl_joining_commissions
  ADD CONSTRAINT tbl_joining_commissions_level_check CHECK (tjc_level BETWEEN 1 AND 3);

ALTER TABLE public.tbl_joining_commissions
  DROP CONSTRAINT IF EXISTS tbl_joining_commissions_amounts_check;

ALTER TABLE public.tbl_joining_commissions
  ADD CONSTRAINT tbl_joining_commissions_amounts_check
  CHECK (
    tjc_plan_amount >= 0
    AND tjc_percentage > 0
    AND tjc_commission_amount >= 0
    AND tjc_required_direct_joins >= 0
    AND tjc_direct_joins_at_award >= 0
  );

ALTER TABLE public.tbl_joining_commissions
  DROP CONSTRAINT IF EXISTS tbl_joining_commissions_status_check;

ALTER TABLE public.tbl_joining_commissions
  ADD CONSTRAINT tbl_joining_commissions_status_check CHECK (tjc_status IN ('credited', 'locked', 'skipped'));

ALTER TABLE public.tbl_joining_commissions
  DROP CONSTRAINT IF EXISTS tbl_joining_commissions_payment_level_recipient_unique;

ALTER TABLE public.tbl_joining_commissions
  ADD CONSTRAINT tbl_joining_commissions_payment_level_recipient_unique
  UNIQUE (tjc_payment_id, tjc_level, tjc_recipient_user_id);

CREATE INDEX IF NOT EXISTS idx_joining_commissions_recipient_created
  ON public.tbl_joining_commissions (tjc_recipient_user_id, tjc_created_at DESC);

CREATE INDEX IF NOT EXISTS idx_joining_commissions_joined_user
  ON public.tbl_joining_commissions (tjc_joined_user_id, tjc_created_at DESC);

ALTER TABLE public.tbl_joining_commissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access" ON public.tbl_joining_commissions;
CREATE POLICY "service_role_full_access"
  ON public.tbl_joining_commissions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "user_select_own_joining_commissions" ON public.tbl_joining_commissions;
CREATE POLICY "user_select_own_joining_commissions"
  ON public.tbl_joining_commissions
  FOR SELECT
  TO authenticated
  USING (tjc_recipient_user_id = auth.uid() OR tjc_joined_user_id = auth.uid());

GRANT SELECT ON public.tbl_joining_commissions TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.tbl_joining_commissions TO service_role;

CREATE OR REPLACE FUNCTION public.count_paid_direct_joins(p_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(COUNT(*), 0)::integer
  FROM public.tbl_users child
  WHERE child.tu_referrer_id = p_user_id
    AND COALESCE(child.tu_is_active, false) = true
    AND COALESCE(child.tu_registration_paid, false) = true;
$$;

REVOKE EXECUTE ON FUNCTION public.count_paid_direct_joins(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.count_paid_direct_joins(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.ensure_working_wallet(p_user_id uuid)
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
    AND tw_wallet_type = 'working'
  LIMIT 1;

  IF v_wallet_id IS NULL THEN
    INSERT INTO public.tbl_wallets (
      tw_user_id,
      tw_balance,
      tw_reserved_balance,
      tw_currency,
      tw_wallet_type
    ) VALUES (
      p_user_id,
      0,
      0,
      'USDT',
      'working'
    )
    ON CONFLICT (tw_user_id, tw_currency, tw_wallet_type) DO NOTHING
    RETURNING tw_id INTO v_wallet_id;

    IF v_wallet_id IS NULL THEN
      SELECT tw_id
        INTO v_wallet_id
      FROM public.tbl_wallets
      WHERE tw_user_id = p_user_id
        AND tw_currency = 'USDT'
        AND tw_wallet_type = 'working'
      LIMIT 1;
    END IF;
  END IF;

  RETURN v_wallet_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.ensure_working_wallet(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_working_wallet(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.award_launch_joining_commissions_for_payment(p_payment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment record;
  v_plan_amount numeric(18, 6);
  v_joined_user_id uuid;
  v_subscription_id uuid;
  v_joined_label text;
  v_level integer;
  v_recipient_id uuid;
  v_required_directs integer;
  v_percent numeric(9, 6);
  v_direct_count integer;
  v_amount numeric(18, 6);
  v_wallet_id uuid;
  v_commission_id uuid;
  v_wallet_tx_id uuid;
  v_credited_total numeric(18, 6) := 0;
  v_credit_count integer := 0;
  v_locked_count integer := 0;
BEGIN
  SELECT
    p.tp_id,
    p.tp_user_id,
    p.tp_subscription_id,
    p.tp_payment_status,
    p.tp_amount,
    us.tus_id,
    us.tus_user_id,
    us.tus_payment_amount,
    COALESCE(us.tus_plan_phase, sp.tsp_plan_phase, 'prelaunch') AS plan_phase,
    sp.tsp_price,
    up.tup_sponsorship_number,
    up.tup_first_name,
    up.tup_last_name,
    u.tu_email
  INTO v_payment
  FROM public.tbl_payments p
  JOIN public.tbl_user_subscriptions us ON us.tus_id = p.tp_subscription_id
  JOIN public.tbl_subscription_plans sp ON sp.tsp_id = us.tus_plan_id
  JOIN public.tbl_users u ON u.tu_id = p.tp_user_id
  LEFT JOIN public.tbl_user_profiles up ON up.tup_user_id = p.tp_user_id
  WHERE p.tp_id = p_payment_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'payment_not_found');
  END IF;

  IF v_payment.tp_payment_status <> 'completed' THEN
    RETURN jsonb_build_object('success', false, 'reason', 'payment_not_completed');
  END IF;

  IF v_payment.plan_phase <> 'launch' THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_launch_plan');
  END IF;

  v_joined_user_id := v_payment.tp_user_id;
  v_subscription_id := v_payment.tp_subscription_id;
  v_plan_amount := ROUND(COALESCE(v_payment.tus_payment_amount, v_payment.tsp_price, v_payment.tp_amount, 0)::numeric, 6);

  IF v_plan_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'reason', 'invalid_plan_amount');
  END IF;

  v_joined_label := COALESCE(
    NULLIF(trim(v_payment.tup_sponsorship_number), ''),
    NULLIF(trim(concat_ws(' ', v_payment.tup_first_name, v_payment.tup_last_name)), ''),
    NULLIF(trim(v_payment.tu_email), ''),
    v_joined_user_id::text
  );

  FOR v_level, v_recipient_id, v_percent, v_required_directs IN
    WITH RECURSIVE uplines AS (
      SELECT
        1 AS level,
        parent.tu_id AS recipient_user_id
      FROM public.tbl_users joined
      JOIN public.tbl_users parent ON parent.tu_id = joined.tu_referrer_id
      WHERE joined.tu_id = v_joined_user_id

      UNION ALL

      SELECT
        u.level + 1,
        parent.tu_id
      FROM uplines u
      JOIN public.tbl_users upline_user ON upline_user.tu_id = u.recipient_user_id
      JOIN public.tbl_users parent ON parent.tu_id = upline_user.tu_referrer_id
      WHERE u.level < 3
    )
    SELECT
      u.level,
      u.recipient_user_id,
      CASE u.level
        WHEN 1 THEN 7.0
        WHEN 2 THEN 1.5
        WHEN 3 THEN 1.0
      END::numeric(9, 6) AS percent,
      CASE u.level
        WHEN 1 THEN 0
        WHEN 2 THEN 3
        WHEN 3 THEN 9
      END AS required_directs
    FROM uplines u
    JOIN public.tbl_users recipient ON recipient.tu_id = u.recipient_user_id
    WHERE COALESCE(recipient.tu_is_active, false) = true
      AND COALESCE(recipient.tu_registration_paid, false) = true
    ORDER BY u.level
  LOOP
    v_commission_id := NULL;
    v_wallet_tx_id := NULL;
    v_direct_count := public.count_paid_direct_joins(v_recipient_id);
    v_amount := ROUND((v_plan_amount * v_percent / 100)::numeric, 6);

    IF v_direct_count < v_required_directs THEN
      INSERT INTO public.tbl_joining_commissions (
        tjc_payment_id,
        tjc_subscription_id,
        tjc_joined_user_id,
        tjc_recipient_user_id,
        tjc_level,
        tjc_plan_amount,
        tjc_percentage,
        tjc_commission_amount,
        tjc_required_direct_joins,
        tjc_direct_joins_at_award,
        tjc_status,
        tjc_skip_reason
      ) VALUES (
        p_payment_id,
        v_subscription_id,
        v_joined_user_id,
        v_recipient_id,
        v_level,
        v_plan_amount,
        v_percent,
        v_amount,
        v_required_directs,
        v_direct_count,
        'locked',
        'direct_join_requirement_not_met'
      )
      ON CONFLICT (tjc_payment_id, tjc_level, tjc_recipient_user_id) DO NOTHING;

      v_locked_count := v_locked_count + 1;
      CONTINUE;
    END IF;

    INSERT INTO public.tbl_joining_commissions (
      tjc_payment_id,
      tjc_subscription_id,
      tjc_joined_user_id,
      tjc_recipient_user_id,
      tjc_level,
      tjc_plan_amount,
      tjc_percentage,
      tjc_commission_amount,
      tjc_required_direct_joins,
      tjc_direct_joins_at_award,
      tjc_status
    ) VALUES (
      p_payment_id,
      v_subscription_id,
      v_joined_user_id,
      v_recipient_id,
      v_level,
      v_plan_amount,
      v_percent,
      v_amount,
      v_required_directs,
      v_direct_count,
      'credited'
    )
    ON CONFLICT (tjc_payment_id, tjc_level, tjc_recipient_user_id) DO NOTHING
    RETURNING tjc_id INTO v_commission_id;

    IF v_commission_id IS NULL THEN
      CONTINUE;
    END IF;

    v_wallet_id := public.ensure_working_wallet(v_recipient_id);

    INSERT INTO public.tbl_wallet_transactions (
      twt_wallet_id,
      twt_user_id,
      twt_transaction_type,
      twt_amount,
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
      'Level ' || v_level || ' joining commission from ' || v_joined_label,
      'completed',
      'joining_commission',
      v_commission_id,
      now()
    )
    RETURNING twt_id INTO v_wallet_tx_id;

    UPDATE public.tbl_wallets
    SET
      tw_balance = COALESCE(tw_balance, 0) + v_amount,
      tw_updated_at = now()
    WHERE tw_id = v_wallet_id;

    UPDATE public.tbl_joining_commissions
    SET tjc_wallet_transaction_id = v_wallet_tx_id
    WHERE tjc_id = v_commission_id;

    v_credited_total := v_credited_total + v_amount;
    v_credit_count := v_credit_count + 1;
    v_commission_id := NULL;
    v_wallet_tx_id := NULL;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'payment_id', p_payment_id,
    'credited_count', v_credit_count,
    'locked_count', v_locked_count,
    'credited_total', v_credited_total
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.award_launch_joining_commissions_for_payment(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.award_launch_joining_commissions_for_payment(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.trigger_award_launch_joining_commissions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.tp_payment_status = 'completed'
     AND NEW.tp_subscription_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR COALESCE(OLD.tp_payment_status, '') IS DISTINCT FROM NEW.tp_payment_status)
  THEN
    PERFORM public.award_launch_joining_commissions_for_payment(NEW.tp_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_award_launch_joining_commissions ON public.tbl_payments;
CREATE TRIGGER trigger_award_launch_joining_commissions
AFTER INSERT OR UPDATE OF tp_payment_status, tp_subscription_id
ON public.tbl_payments
FOR EACH ROW
EXECUTE FUNCTION public.trigger_award_launch_joining_commissions();
