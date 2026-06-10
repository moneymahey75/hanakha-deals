ALTER TABLE public.tbl_coupons
  ADD COLUMN IF NOT EXISTS tc_feedback_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tc_feedback_samples text[] NOT NULL DEFAULT '{}'::text[];

ALTER TABLE public.tbl_coupons
  DROP CONSTRAINT IF EXISTS tbl_coupons_feedback_samples_limit_check;

ALTER TABLE public.tbl_coupons
  ADD CONSTRAINT tbl_coupons_feedback_samples_limit_check
  CHECK (cardinality(tc_feedback_samples) <= 5);

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
  tc_feedback_enabled boolean,
  tc_feedback_samples text[],
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
    COALESCE(c.tc_feedback_enabled, false),
    COALESCE(c.tc_feedback_samples, '{}'::text[]),
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
  feedback_enabled boolean,
  feedback_samples text[],
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

    UPDATE public.tbl_user_reward_coupons rc
    SET
      turc_plan_amount = v_subscription.plan_amount,
      turc_daily_target_amount = v_daily_amount,
      turc_day_number = v_subscription.day_number,
      turc_reward_amount = LEAST(
        v_daily_amount,
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
    FROM public.tbl_coupons c
    WHERE rc.turc_coupon_id = c.tc_id
      AND rc.turc_user_id = v_user_id
      AND rc.turc_subscription_id = v_subscription.subscription_id
      AND rc.turc_reward_date = v_today
      AND rc.turc_status IN ('available', 'opened')
      AND c.tc_status = 'approved'
      AND c.tc_is_active = true
      AND COALESCE(c.tc_launch_now, false) = true
      AND c.tc_launch_date >= v_day_start
      AND c.tc_launch_date < v_day_end
      AND (COALESCE(c.tc_reward_percentage, 0) > 0 OR COALESCE(c.tc_share_reward_amount, 0) > 0);

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
      COALESCE(c.tc_reveal_timer_seconds, 30) AS timer_seconds,
      COALESCE(c.tc_feedback_enabled, false) AS feedback_enabled,
      COALESCE(c.tc_feedback_samples, '{}'::text[]) AS feedback_samples
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
    r.feedback_enabled,
    r.feedback_samples,
    ((r.turc_reward_date + 1)::timestamp AT TIME ZONE 'Asia/Kolkata') - interval '1 second'
  FROM rows r
  ORDER BY r.turc_reward_date DESC, r.turc_created_at DESC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_user_reward_coupons() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_reward_coupons() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_user_reward_coupons() TO authenticated;

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
  v_feedback_text text := NULLIF(trim(COALESCE(p_feedback_text, '')), '');
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

  IF COALESCE(v_coupon.tc_feedback_enabled, false) THEN
    IF v_feedback_text IS NULL THEN
      RAISE EXCEPTION 'Feedback is required for this coupon';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM unnest(COALESCE(v_coupon.tc_feedback_samples, '{}'::text[])) AS feedback_sample(sample_text)
      WHERE lower(trim(feedback_sample.sample_text)) = lower(v_feedback_text)
    ) THEN
      RAISE EXCEPTION 'Please write your own feedback instead of using a sample';
    END IF;
  END IF;

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
    turc_feedback_text = v_feedback_text,
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
    v_feedback_text
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

REVOKE EXECUTE ON FUNCTION public.react_reward_coupon(uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.react_reward_coupon(uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.react_reward_coupon(uuid, text, text) TO authenticated;
