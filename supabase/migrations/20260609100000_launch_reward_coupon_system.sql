-- Launch reward coupon system.
-- Users receive daily coupon rewards for 200 days at 1% of the full launch plan price.

ALTER TABLE public.tbl_coupons
  ADD COLUMN IF NOT EXISTS tc_reveal_timer_seconds integer NOT NULL DEFAULT 30;

ALTER TABLE public.tbl_coupons
  ADD COLUMN IF NOT EXISTS tc_reward_percentage numeric(9, 6);

ALTER TABLE public.tbl_coupons
  DROP CONSTRAINT IF EXISTS tbl_coupons_reveal_timer_seconds_check;

ALTER TABLE public.tbl_coupons
  ADD CONSTRAINT tbl_coupons_reveal_timer_seconds_check
  CHECK (tc_reveal_timer_seconds >= 0 AND tc_reveal_timer_seconds <= 86400);

ALTER TABLE public.tbl_coupons
  DROP CONSTRAINT IF EXISTS tbl_coupons_reward_percentage_check;

ALTER TABLE public.tbl_coupons
  ADD CONSTRAINT tbl_coupons_reward_percentage_check
  CHECK (tc_reward_percentage IS NULL OR (tc_reward_percentage > 0 AND tc_reward_percentage <= 1));

CREATE INDEX IF NOT EXISTS idx_subscription_plans_launch_reward_cap
  ON public.tbl_subscription_plans (tsp_price)
  WHERE tsp_is_active = true
    AND tsp_plan_phase = 'launch'
    AND tsp_deleted_at IS NULL
    AND tsp_price > 0;

CREATE INDEX IF NOT EXISTS idx_coupons_launch_reward_cap
  ON public.tbl_coupons (tc_launch_date)
  INCLUDE (tc_share_reward_amount, tc_reward_percentage, tc_id)
  WHERE tc_status = 'approved'
    AND COALESCE(tc_is_active, false) = true
    AND COALESCE(tc_launch_now, false) = true
    AND tc_launch_date IS NOT NULL
    AND (COALESCE(tc_reward_percentage, 0) > 0 OR COALESCE(tc_share_reward_amount, 0) > 0);

DROP TRIGGER IF EXISTS trigger_validate_launch_coupon_daily_reward_cap ON public.tbl_coupons;
DROP FUNCTION IF EXISTS public.get_launch_coupon_daily_reward_cap();
DROP FUNCTION IF EXISTS public.validate_launch_coupon_daily_reward_cap();

CREATE OR REPLACE FUNCTION public.shopclick_business_date()
RETURNS date
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (now() AT TIME ZONE 'Asia/Kolkata')::date;
$$;

REVOKE EXECUTE ON FUNCTION public.shopclick_business_date() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.shopclick_business_date() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.shopclick_business_date() FROM anon;
GRANT EXECUTE ON FUNCTION public.shopclick_business_date() TO service_role;

ALTER TABLE public.tbl_wallets
  DROP CONSTRAINT IF EXISTS tbl_wallets_wallet_type_check;

ALTER TABLE public.tbl_wallets
  ADD CONSTRAINT tbl_wallets_wallet_type_check
  CHECK (tw_wallet_type IN ('working', 'non_working', 'reward'));

ALTER TABLE public.tbl_withdrawal_requests
  DROP CONSTRAINT IF EXISTS tbl_withdrawal_requests_wallet_type_check;

ALTER TABLE public.tbl_withdrawal_requests
  ADD CONSTRAINT tbl_withdrawal_requests_wallet_type_check
  CHECK (twr_wallet_type IN ('working', 'non_working', 'reward'));

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
      'reward_coupon'
    )
  );

CREATE TABLE IF NOT EXISTS public.tbl_user_reward_coupons (
  turc_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  turc_user_id uuid NOT NULL REFERENCES public.tbl_users(tu_id) ON DELETE CASCADE,
  turc_subscription_id uuid NOT NULL REFERENCES public.tbl_user_subscriptions(tus_id) ON DELETE CASCADE,
  turc_coupon_id uuid NOT NULL REFERENCES public.tbl_coupons(tc_id) ON DELETE CASCADE,
  turc_reward_date date NOT NULL DEFAULT CURRENT_DATE,
  turc_day_number integer NOT NULL,
  turc_plan_amount numeric(18, 6) NOT NULL DEFAULT 0,
  turc_daily_target_amount numeric(18, 6) NOT NULL DEFAULT 0,
  turc_reward_amount numeric(18, 6) NOT NULL DEFAULT 0,
  turc_status text NOT NULL DEFAULT 'available',
  turc_opened_at timestamptz,
  turc_reaction_available_at timestamptz,
  turc_reacted_at timestamptz,
  turc_reaction text,
  turc_feedback_text text,
  turc_created_at timestamptz NOT NULL DEFAULT now(),
  turc_updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tbl_user_reward_coupons_status_check
    CHECK (turc_status IN ('available', 'opened', 'liked', 'disliked', 'expired')),
  CONSTRAINT tbl_user_reward_coupons_reaction_check
    CHECK (turc_reaction IS NULL OR turc_reaction IN ('liked', 'disliked')),
  CONSTRAINT tbl_user_reward_coupons_amount_check
    CHECK (turc_reward_amount >= 0 AND turc_daily_target_amount >= 0 AND turc_plan_amount >= 0),
  CONSTRAINT tbl_user_reward_coupons_day_check
    CHECK (turc_day_number BETWEEN 1 AND 200),
  CONSTRAINT tbl_user_reward_coupons_once_per_day UNIQUE (turc_user_id, turc_coupon_id, turc_reward_date)
);

ALTER TABLE public.tbl_user_reward_coupons
  ADD COLUMN IF NOT EXISTS turc_id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS turc_user_id uuid REFERENCES public.tbl_users(tu_id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS turc_subscription_id uuid REFERENCES public.tbl_user_subscriptions(tus_id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS turc_coupon_id uuid REFERENCES public.tbl_coupons(tc_id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS turc_reward_date date NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS turc_day_number integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS turc_plan_amount numeric(18, 6) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS turc_daily_target_amount numeric(18, 6) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS turc_reward_amount numeric(18, 6) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS turc_status text NOT NULL DEFAULT 'available',
  ADD COLUMN IF NOT EXISTS turc_opened_at timestamptz,
  ADD COLUMN IF NOT EXISTS turc_reaction_available_at timestamptz,
  ADD COLUMN IF NOT EXISTS turc_reacted_at timestamptz,
  ADD COLUMN IF NOT EXISTS turc_reaction text,
  ADD COLUMN IF NOT EXISTS turc_feedback_text text,
  ADD COLUMN IF NOT EXISTS turc_created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS turc_updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.tbl_user_reward_coupons
  DROP CONSTRAINT IF EXISTS tbl_user_reward_coupons_status_check;

ALTER TABLE public.tbl_user_reward_coupons
  ADD CONSTRAINT tbl_user_reward_coupons_status_check
  CHECK (turc_status IN ('available', 'opened', 'liked', 'disliked', 'expired'));

ALTER TABLE public.tbl_user_reward_coupons
  DROP CONSTRAINT IF EXISTS tbl_user_reward_coupons_reaction_check;

ALTER TABLE public.tbl_user_reward_coupons
  ADD CONSTRAINT tbl_user_reward_coupons_reaction_check
  CHECK (turc_reaction IS NULL OR turc_reaction IN ('liked', 'disliked'));

ALTER TABLE public.tbl_user_reward_coupons
  DROP CONSTRAINT IF EXISTS tbl_user_reward_coupons_amount_check;

ALTER TABLE public.tbl_user_reward_coupons
  ADD CONSTRAINT tbl_user_reward_coupons_amount_check
  CHECK (turc_reward_amount >= 0 AND turc_daily_target_amount >= 0 AND turc_plan_amount >= 0);

ALTER TABLE public.tbl_user_reward_coupons
  DROP CONSTRAINT IF EXISTS tbl_user_reward_coupons_day_check;

ALTER TABLE public.tbl_user_reward_coupons
  ADD CONSTRAINT tbl_user_reward_coupons_day_check
  CHECK (turc_day_number BETWEEN 1 AND 200);

ALTER TABLE public.tbl_user_reward_coupons
  DROP CONSTRAINT IF EXISTS tbl_user_reward_coupons_once_per_day;

ALTER TABLE public.tbl_user_reward_coupons
  ADD CONSTRAINT tbl_user_reward_coupons_once_per_day UNIQUE (turc_user_id, turc_coupon_id, turc_reward_date);

ALTER TABLE public.tbl_user_reward_coupons
  ALTER COLUMN turc_reward_date SET DEFAULT public.shopclick_business_date();

CREATE INDEX IF NOT EXISTS idx_user_reward_coupons_user_date
  ON public.tbl_user_reward_coupons(turc_user_id, turc_reward_date DESC);

CREATE INDEX IF NOT EXISTS idx_user_reward_coupons_status
  ON public.tbl_user_reward_coupons(turc_status);

CREATE INDEX IF NOT EXISTS idx_user_reward_coupons_user_subscription_day
  ON public.tbl_user_reward_coupons(turc_user_id, turc_subscription_id, turc_reward_date, turc_status)
  INCLUDE (turc_reward_amount);

CREATE INDEX IF NOT EXISTS idx_user_reward_coupons_expiry_cleanup
  ON public.tbl_user_reward_coupons(turc_reward_date, turc_user_id)
  WHERE turc_status = 'available';

CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_transactions_reward_coupon_once
  ON public.tbl_wallet_transactions(twt_reference_type, twt_reference_id)
  WHERE twt_reference_type = 'reward_coupon';

ALTER TABLE public.tbl_user_reward_coupons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access" ON public.tbl_user_reward_coupons;
CREATE POLICY "service_role_full_access"
  ON public.tbl_user_reward_coupons
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "user_select_own" ON public.tbl_user_reward_coupons;
CREATE POLICY "user_select_own"
  ON public.tbl_user_reward_coupons
  FOR SELECT
  TO authenticated
  USING (turc_user_id = auth.uid());

DROP POLICY IF EXISTS "admin_read_reward_coupons" ON public.tbl_user_reward_coupons;
CREATE POLICY "admin_read_reward_coupons"
  ON public.tbl_user_reward_coupons
  FOR SELECT
  TO authenticated
  USING (is_admin());

INSERT INTO public.tbl_system_settings (tss_setting_key, tss_setting_value, tss_description)
VALUES
  ('reward_withdrawal_min_amount', '10', 'Minimum withdrawal amount for reward coupon wallet in USDT')
ON CONFLICT (tss_setting_key) DO NOTHING;

DROP FUNCTION IF EXISTS public.admin_get_coupons(text, text, integer, integer);

CREATE OR REPLACE FUNCTION public.admin_get_coupons(
  p_search_term text DEFAULT NULL,
  p_status_filter text DEFAULT 'all',
  p_offset integer DEFAULT 0,
  p_limit integer DEFAULT 1000
)
RETURNS TABLE (
  tc_id uuid,
  tc_created_by uuid,
  tc_company_id uuid,
  tc_title text,
  tc_description text,
  tc_coupon_code text,
  tc_discount_type text,
  tc_discount_value numeric,
  tc_image_url text,
  tc_terms_conditions text,
  tc_valid_from timestamptz,
  tc_valid_until timestamptz,
  tc_usage_limit integer,
  tc_used_count integer,
  tc_share_reward_amount numeric,
  tc_reward_percentage numeric,
  tc_status text,
  tc_is_active boolean,
  tc_launch_now boolean,
  tc_launch_date timestamptz,
  tc_website_url text,
  tc_reveal_timer_seconds integer,
  tc_created_at timestamptz,
  tc_updated_at timestamptz,
  company_data jsonb,
  total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_count bigint;
BEGIN
  SELECT COUNT(*)
    INTO v_total_count
  FROM public.tbl_coupons c
  LEFT JOIN public.tbl_companies comp ON c.tc_company_id = comp.tc_id
  WHERE (p_search_term IS NULL OR
         c.tc_title ILIKE '%' || p_search_term || '%' OR
         c.tc_coupon_code ILIKE '%' || p_search_term || '%' OR
         c.tc_description ILIKE '%' || p_search_term || '%' OR
         comp.tc_company_name ILIKE '%' || p_search_term || '%')
    AND (p_status_filter = 'all' OR
         (p_status_filter = 'active' AND c.tc_is_active = true) OR
         (p_status_filter = 'inactive' AND c.tc_is_active = false) OR
         c.tc_status = p_status_filter);

  RETURN QUERY
  SELECT
    c.tc_id,
    c.tc_created_by,
    c.tc_company_id,
    c.tc_title,
    c.tc_description,
    c.tc_coupon_code,
    c.tc_discount_type,
    c.tc_discount_value,
    c.tc_image_url,
    c.tc_terms_conditions,
    c.tc_valid_from,
    c.tc_valid_until,
    c.tc_usage_limit,
    c.tc_used_count,
    c.tc_share_reward_amount,
    c.tc_reward_percentage,
    c.tc_status,
    c.tc_is_active,
    c.tc_launch_now,
    c.tc_launch_date,
    c.tc_website_url,
    c.tc_reveal_timer_seconds,
    c.tc_created_at,
    c.tc_updated_at,
    CASE
      WHEN comp.tc_id IS NULL THEN NULL
      ELSE jsonb_build_object(
        'tc_company_name', comp.tc_company_name,
        'tc_official_email', comp.tc_official_email
      )
    END AS company_data,
    v_total_count
  FROM public.tbl_coupons c
  LEFT JOIN public.tbl_companies comp ON c.tc_company_id = comp.tc_id
  WHERE (p_search_term IS NULL OR
         c.tc_title ILIKE '%' || p_search_term || '%' OR
         c.tc_coupon_code ILIKE '%' || p_search_term || '%' OR
         c.tc_description ILIKE '%' || p_search_term || '%' OR
         comp.tc_company_name ILIKE '%' || p_search_term || '%')
    AND (p_status_filter = 'all' OR
         (p_status_filter = 'active' AND c.tc_is_active = true) OR
         (p_status_filter = 'inactive' AND c.tc_is_active = false) OR
         c.tc_status = p_status_filter)
  ORDER BY c.tc_created_at DESC
  OFFSET p_offset
  LIMIT p_limit;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_get_coupons(text, text, integer, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_get_coupons(text, text, integer, integer) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_get_coupons(text, text, integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_get_coupons(text, text, integer, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.update_reward_coupons_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.turc_updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_reward_coupons_updated_at ON public.tbl_user_reward_coupons;
CREATE TRIGGER trigger_reward_coupons_updated_at
  BEFORE UPDATE ON public.tbl_user_reward_coupons
  FOR EACH ROW
  EXECUTE FUNCTION public.update_reward_coupons_updated_at();

CREATE OR REPLACE FUNCTION public.cleanup_expired_reward_coupons(
  p_before_date date DEFAULT public.shopclick_business_date(),
  p_limit integer DEFAULT 50000
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted_count integer;
BEGIN
  WITH expired_rows AS (
    SELECT turc_id
    FROM public.tbl_user_reward_coupons
    WHERE turc_status = 'available'
      AND turc_reward_date < p_before_date
    ORDER BY turc_reward_date, turc_id
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50000), 200000))
  ),
  deleted AS (
    DELETE FROM public.tbl_user_reward_coupons rc
    USING expired_rows er
    WHERE rc.turc_id = er.turc_id
    RETURNING rc.turc_id
  )
  SELECT COUNT(*)::integer INTO v_deleted_count
  FROM deleted;

  RETURN COALESCE(v_deleted_count, 0);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cleanup_expired_reward_coupons(date, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cleanup_expired_reward_coupons(date, integer) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_expired_reward_coupons(date, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_reward_coupons(date, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.get_latest_launch_reward_subscription(p_user_id uuid)
RETURNS TABLE (
  subscription_id uuid,
  plan_id uuid,
  plan_amount numeric,
  start_date timestamptz,
  day_number integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date := public.shopclick_business_date();
BEGIN
  RETURN QUERY
  SELECT
    us.tus_id,
    us.tus_plan_id,
    COALESCE(sp.tsp_price, 0)::numeric,
    us.tus_start_date,
    (v_today - (us.tus_start_date AT TIME ZONE 'Asia/Kolkata')::date + 1)::integer
  FROM public.tbl_user_subscriptions us
  JOIN public.tbl_subscription_plans sp ON sp.tsp_id = us.tus_plan_id
  WHERE us.tus_user_id = p_user_id
    AND us.tus_status IN ('active', 'upgraded')
    AND COALESCE(us.tus_plan_phase, sp.tsp_plan_phase, 'prelaunch') = 'launch'
    AND (v_today - (us.tus_start_date AT TIME ZONE 'Asia/Kolkata')::date + 1) BETWEEN 1 AND 200
  ORDER BY us.tus_start_date DESC
  LIMIT 1;
END;
$$;

DROP FUNCTION IF EXISTS public.get_user_reward_coupons();

CREATE OR REPLACE FUNCTION public.get_user_reward_coupons()
RETURNS TABLE (
  assignment_id uuid,
  coupon_id uuid,
  title text,
  description text,
  coupon_code text,
  image_url text,
  website_url text,
  reward_amount numeric,
  reward_date date,
  day_number integer,
  daily_target_amount numeric,
  assigned_total_amount numeric,
  status text,
  opened_at timestamptz,
  reaction_available_at timestamptz,
  reacted_at timestamptz,
  reaction text,
  timer_seconds integer,
  expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_subscription record;
  v_daily_amount numeric;
  v_existing_assigned_amount numeric;
  v_remaining_daily_amount numeric;
  v_today date := public.shopclick_business_date();
  v_day_start timestamptz := public.shopclick_business_date()::timestamp AT TIME ZONE 'Asia/Kolkata';
  v_day_end timestamptz := (public.shopclick_business_date() + 1)::timestamp AT TIME ZONE 'Asia/Kolkata';
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  DELETE FROM public.tbl_user_reward_coupons
  WHERE turc_user_id = v_user_id
    AND turc_status = 'available'
    AND turc_reward_date < v_today;

  SELECT * INTO v_subscription
  FROM public.get_latest_launch_reward_subscription(v_user_id)
  LIMIT 1;

  IF v_subscription.subscription_id IS NOT NULL THEN
    v_daily_amount := ROUND((COALESCE(v_subscription.plan_amount, 0) * 0.01)::numeric, 6);

    SELECT COALESCE(SUM(turc_reward_amount), 0)
      INTO v_existing_assigned_amount
    FROM public.tbl_user_reward_coupons
    WHERE turc_user_id = v_user_id
      AND turc_subscription_id = v_subscription.subscription_id
      AND turc_reward_date = v_today
      AND turc_status IN ('available', 'opened', 'liked', 'disliked');

    v_remaining_daily_amount := GREATEST(v_daily_amount - COALESCE(v_existing_assigned_amount, 0), 0);

    INSERT INTO public.tbl_user_reward_coupons (
      turc_user_id,
      turc_subscription_id,
      turc_coupon_id,
      turc_reward_date,
      turc_day_number,
      turc_plan_amount,
      turc_daily_target_amount,
      turc_reward_amount
    )
    SELECT
      v_user_id,
      v_subscription.subscription_id,
      assigned.tc_id,
      v_today,
      v_subscription.day_number,
      v_subscription.plan_amount,
      v_daily_amount,
      assigned.reward_amount
    FROM (
      SELECT
        ranked.tc_id,
        LEAST(
          ranked.coupon_amount,
          GREATEST(v_remaining_daily_amount - ranked.amount_before, 0)
        ) AS reward_amount
      FROM (
        SELECT
          c.tc_id,
          ROUND(
            CASE
              WHEN COALESCE(c.tc_reward_percentage, 0) > 0 THEN
                (COALESCE(v_subscription.plan_amount, 0) * COALESCE(c.tc_reward_percentage, 0) / 100)::numeric
              ELSE
                COALESCE(c.tc_share_reward_amount, 0)::numeric
            END,
            6
          ) AS coupon_amount,
          COALESCE(
            SUM(
              ROUND(
                CASE
                  WHEN COALESCE(c.tc_reward_percentage, 0) > 0 THEN
                    (COALESCE(v_subscription.plan_amount, 0) * COALESCE(c.tc_reward_percentage, 0) / 100)::numeric
                  ELSE
                    COALESCE(c.tc_share_reward_amount, 0)::numeric
                END,
                6
              )
            )
              OVER (ORDER BY c.tc_created_at, c.tc_id ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),
            0
          ) AS amount_before
        FROM public.tbl_coupons c
        WHERE c.tc_status = 'approved'
          AND c.tc_is_active = true
          AND COALESCE(c.tc_launch_now, false) = true
          AND c.tc_launch_date >= v_day_start
          AND c.tc_launch_date < v_day_end
          AND (COALESCE(c.tc_reward_percentage, 0) > 0 OR COALESCE(c.tc_share_reward_amount, 0) > 0)
          AND NOT EXISTS (
            SELECT 1
            FROM public.tbl_user_reward_coupons existing
            WHERE existing.turc_user_id = v_user_id
              AND existing.turc_coupon_id = c.tc_id
              AND existing.turc_reward_date = v_today
          )
      ) ranked
      WHERE ranked.amount_before < v_remaining_daily_amount
    ) assigned
    WHERE assigned.reward_amount > 0
    ON CONFLICT (turc_user_id, turc_coupon_id, turc_reward_date) DO NOTHING;
  END IF;

  RETURN QUERY
  WITH rows AS (
    SELECT
      rc.*,
      c.tc_title,
      c.tc_description,
      CASE
        WHEN rc.turc_status IN ('liked', 'disliked')
          OR (
            rc.turc_status = 'opened'
            AND (
              rc.turc_reaction_available_at IS NULL
              OR now() >= rc.turc_reaction_available_at
            )
          )
        THEN c.tc_coupon_code
        ELSE NULL
      END AS tc_coupon_code,
      c.tc_image_url,
      c.tc_website_url,
      COALESCE(c.tc_reveal_timer_seconds, 30) AS timer_seconds
    FROM public.tbl_user_reward_coupons rc
    JOIN public.tbl_coupons c ON c.tc_id = rc.turc_coupon_id
    WHERE rc.turc_user_id = v_user_id
      AND (
        rc.turc_reward_date = v_today
        OR rc.turc_status IN ('opened', 'liked', 'disliked')
      )
  )
  SELECT
    r.turc_id,
    r.turc_coupon_id,
    r.tc_title,
    r.tc_description,
    r.tc_coupon_code,
    r.tc_image_url,
    r.tc_website_url,
    r.turc_reward_amount,
    r.turc_reward_date,
    r.turc_day_number,
    r.turc_daily_target_amount,
    SUM(r.turc_reward_amount) OVER (PARTITION BY r.turc_reward_date),
    r.turc_status,
    r.turc_opened_at,
    r.turc_reaction_available_at,
    r.turc_reacted_at,
    r.turc_reaction,
    r.timer_seconds,
    ((r.turc_reward_date + 1)::timestamp AT TIME ZONE 'Asia/Kolkata') - interval '1 second'
  FROM rows r
  ORDER BY r.turc_reward_date DESC, r.turc_created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.open_reward_coupon(p_assignment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_assignment record;
  v_coupon record;
  v_timer integer;
  v_today date := public.shopclick_business_date();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_assignment
  FROM public.tbl_user_reward_coupons
  WHERE turc_id = p_assignment_id
    AND turc_user_id = v_user_id
  FOR UPDATE;

  IF v_assignment.turc_id IS NULL THEN
    RAISE EXCEPTION 'Coupon assignment not found';
  END IF;

  IF v_assignment.turc_reward_date <> v_today THEN
    DELETE FROM public.tbl_user_reward_coupons
    WHERE turc_id = p_assignment_id
      AND turc_status = 'available';
    RAISE EXCEPTION 'This coupon has expired';
  END IF;

  SELECT * INTO v_coupon
  FROM public.tbl_coupons
  WHERE tc_id = v_assignment.turc_coupon_id;

  v_timer := COALESCE(v_coupon.tc_reveal_timer_seconds, 30);

  IF v_assignment.turc_status IN ('opened', 'liked', 'disliked') THEN
    RETURN jsonb_build_object(
      'reward_amount', v_assignment.turc_reward_amount,
      'status', v_assignment.turc_status,
      'opened_at', v_assignment.turc_opened_at,
      'reaction_available_at', v_assignment.turc_reaction_available_at
    );
  END IF;

  IF v_assignment.turc_status <> 'available' THEN
    RAISE EXCEPTION 'Coupon is not available';
  END IF;

  UPDATE public.tbl_user_reward_coupons
  SET
    turc_status = 'opened',
    turc_opened_at = now(),
    turc_reaction_available_at = now() + make_interval(secs => v_timer)
  WHERE turc_id = p_assignment_id
  RETURNING * INTO v_assignment;

  RETURN jsonb_build_object(
    'reward_amount', v_assignment.turc_reward_amount,
    'status', v_assignment.turc_status,
    'opened_at', v_assignment.turc_opened_at,
    'reaction_available_at', v_assignment.turc_reaction_available_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.react_reward_coupon(
  p_assignment_id uuid,
  p_reaction text,
  p_feedback_text text DEFAULT NULL
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
  v_reaction text := lower(trim(COALESCE(p_reaction, '')));
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF v_reaction NOT IN ('liked', 'disliked') THEN
    RAISE EXCEPTION 'Invalid reaction';
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
      'reacted_at', v_assignment.turc_reacted_at,
      'reward_credited', false
    );
  END IF;

  IF v_assignment.turc_status NOT IN ('opened', 'liked', 'disliked') THEN
    RAISE EXCEPTION 'Open this coupon before liking or disliking';
  END IF;

  IF v_assignment.turc_reaction_available_at IS NOT NULL
     AND now() < v_assignment.turc_reaction_available_at THEN
    RAISE EXCEPTION 'Please wait until the timer completes';
  END IF;

  SELECT * INTO v_coupon
  FROM public.tbl_coupons
  WHERE tc_id = v_assignment.turc_coupon_id;

  SELECT tw_id, tw_balance INTO v_wallet_id, v_balance
  FROM public.tbl_wallets
  WHERE tw_user_id = v_user_id
    AND tw_currency = 'USDT'
    AND tw_wallet_type = 'reward'
  FOR UPDATE;

  IF v_wallet_id IS NULL THEN
    INSERT INTO public.tbl_wallets (tw_user_id, tw_balance, tw_currency, tw_wallet_type, tw_is_active)
    VALUES (v_user_id, 0, 'USDT', 'reward', true)
    RETURNING tw_id, tw_balance INTO v_wallet_id, v_balance;
  END IF;

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
    SET tw_balance = COALESCE(tw_balance, 0) + v_assignment.turc_reward_amount
    WHERE tw_id = v_wallet_id;
  END IF;

  UPDATE public.tbl_user_reward_coupons
  SET
    turc_status = v_reaction,
    turc_reaction = v_reaction,
    turc_feedback_text = NULLIF(p_feedback_text, ''),
    turc_reacted_at = now()
  WHERE turc_id = p_assignment_id
  RETURNING * INTO v_assignment;

  INSERT INTO public.tbl_coupon_interactions (
    tci_user_id,
    tci_coupon_id,
    tci_interaction_type,
    tci_feedback_text
  )
  VALUES (
    v_user_id,
    v_assignment.turc_coupon_id,
    v_reaction,
    NULLIF(p_feedback_text, '')
  )
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object(
    'status', v_assignment.turc_status,
    'reaction', v_assignment.turc_reaction,
    'reacted_at', v_assignment.turc_reacted_at,
    'reward_credited', v_transaction_id IS NOT NULL,
    'reward_amount', v_assignment.turc_reward_amount
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_reward_wallet_withdrawal_status()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_min_amount numeric := 10;
  v_balance numeric := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT COALESCE((tss_setting_value::jsonb)::numeric, 10)
    INTO v_min_amount
  FROM public.tbl_system_settings
  WHERE tss_setting_key = 'reward_withdrawal_min_amount'
  LIMIT 1;

  SELECT COALESCE(tw_balance, 0)
    INTO v_balance
  FROM public.tbl_wallets
  WHERE tw_user_id = v_user_id
    AND tw_currency = 'USDT'
    AND tw_wallet_type = 'reward'
  LIMIT 1;

  RETURN jsonb_build_object(
    'balance', COALESCE(v_balance, 0),
    'minimum_amount', COALESCE(v_min_amount, 10),
    'can_withdraw', COALESCE(v_balance, 0) >= COALESCE(v_min_amount, 10)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_reward_coupons() TO authenticated;
GRANT EXECUTE ON FUNCTION public.open_reward_coupon(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.react_reward_coupon(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_reward_wallet_withdrawal_status() TO authenticated;
