-- Classify launch package purchases as registration, upgrade, or renew.
--
-- Business rule:
-- - First launch package is the user's registration package, even for users who
--   originally joined with the old 5 USDT registration.
-- - Purchases made while a registration/renew package is still earning are
--   upgrade packages and do not pay direct income.
-- - After the registration/renew package is exhausted, the next launch package
--   is a renew package and pays direct income like registration.

ALTER TABLE public.tbl_user_subscriptions
  ADD COLUMN IF NOT EXISTS tus_package_kind text;

ALTER TABLE public.tbl_user_subscriptions
  DROP CONSTRAINT IF EXISTS tbl_user_subscriptions_package_kind_check;

ALTER TABLE public.tbl_user_subscriptions
  ADD CONSTRAINT tbl_user_subscriptions_package_kind_check
  CHECK (tus_package_kind IS NULL OR tus_package_kind IN ('registration', 'upgrade', 'renew'));

UPDATE public.tbl_user_subscriptions us
SET tus_plan_phase = COALESCE(sp.tsp_plan_phase, us.tus_plan_phase, 'prelaunch')
FROM public.tbl_subscription_plans sp
WHERE sp.tsp_id = us.tus_plan_id
  AND COALESCE(sp.tsp_plan_phase, us.tus_plan_phase, 'prelaunch') IS DISTINCT FROM us.tus_plan_phase;

UPDATE public.tbl_user_subscriptions us
SET tus_package_kind = CASE WHEN lower(COALESCE(sp.tsp_type::text, 'registration')) = 'upgrade' THEN 'upgrade' ELSE 'registration' END
FROM public.tbl_subscription_plans sp
WHERE sp.tsp_id = us.tus_plan_id
  AND us.tus_package_kind IS NULL
  AND COALESCE(us.tus_plan_phase, sp.tsp_plan_phase, 'prelaunch') <> 'launch';

WITH RECURSIVE ordered_launch_subscriptions AS (
  SELECT
    us.tus_id,
    us.tus_user_id,
    us.tus_start_date,
    us.tus_exhausted_at,
    ROW_NUMBER() OVER (
      PARTITION BY us.tus_user_id
      ORDER BY us.tus_start_date ASC NULLS LAST, us.tus_id
    ) AS row_number
  FROM public.tbl_user_subscriptions us
  JOIN public.tbl_subscription_plans sp ON sp.tsp_id = us.tus_plan_id
  WHERE us.tus_package_kind IS NULL
    AND COALESCE(us.tus_plan_phase, sp.tsp_plan_phase, 'prelaunch') = 'launch'
),
classified_launch_subscriptions AS (
  SELECT
    ordered.tus_id,
    ordered.tus_user_id,
    ordered.row_number,
    'registration'::text AS package_kind,
    ordered.tus_exhausted_at AS earning_exhausted_at
  FROM ordered_launch_subscriptions ordered
  WHERE ordered.row_number = 1

  UNION ALL

  SELECT
    ordered.tus_id,
    ordered.tus_user_id,
    ordered.row_number,
    CASE
      WHEN classified.earning_exhausted_at IS NULL
        OR COALESCE(ordered.tus_start_date, now()) < classified.earning_exhausted_at
      THEN 'upgrade'
      ELSE 'renew'
    END AS package_kind,
    CASE
      WHEN classified.earning_exhausted_at IS NULL
        OR COALESCE(ordered.tus_start_date, now()) < classified.earning_exhausted_at
      THEN classified.earning_exhausted_at
      ELSE ordered.tus_exhausted_at
    END AS earning_exhausted_at
  FROM classified_launch_subscriptions classified
  JOIN ordered_launch_subscriptions ordered
    ON ordered.tus_user_id = classified.tus_user_id
   AND ordered.row_number = classified.row_number + 1
)
UPDATE public.tbl_user_subscriptions us
SET tus_package_kind = classified.package_kind
FROM classified_launch_subscriptions classified
WHERE classified.tus_id = us.tus_id;

CREATE OR REPLACE FUNCTION public.determine_subscription_package_kind(
  p_user_id uuid,
  p_plan_id uuid
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan_type text;
  v_plan_phase text;
BEGIN
  SELECT
    lower(COALESCE(sp.tsp_type::text, 'registration')),
    COALESCE(sp.tsp_plan_phase, 'prelaunch')
  INTO v_plan_type, v_plan_phase
  FROM public.tbl_subscription_plans sp
  WHERE sp.tsp_id = p_plan_id;

  IF v_plan_phase <> 'launch' THEN
    RETURN CASE WHEN v_plan_type = 'upgrade' THEN 'upgrade' ELSE 'registration' END;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.tbl_user_subscriptions us
    JOIN public.tbl_subscription_plans sp ON sp.tsp_id = us.tus_plan_id
    WHERE us.tus_user_id = p_user_id
      AND us.tus_status IN ('active', 'upgraded')
      AND us.tus_exhausted_at IS NULL
      AND (us.tus_end_date IS NULL OR us.tus_end_date > now())
      AND COALESCE(us.tus_plan_phase, sp.tsp_plan_phase, 'prelaunch') = 'launch'
      AND COALESCE(us.tus_package_kind, 'registration') IN ('registration', 'renew')
  ) THEN
    RETURN 'upgrade';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.tbl_user_subscriptions us
    JOIN public.tbl_subscription_plans sp ON sp.tsp_id = us.tus_plan_id
    WHERE us.tus_user_id = p_user_id
      AND COALESCE(us.tus_plan_phase, sp.tsp_plan_phase, 'prelaunch') = 'launch'
      AND COALESCE(us.tus_package_kind, 'registration') IN ('registration', 'renew')
  ) THEN
    RETURN 'renew';
  END IF;

  RETURN 'registration';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.determine_subscription_package_kind(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.determine_subscription_package_kind(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.set_subscription_package_kind()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan_phase text;
BEGIN
  SELECT COALESCE(sp.tsp_plan_phase, 'prelaunch')
  INTO v_plan_phase
  FROM public.tbl_subscription_plans sp
  WHERE sp.tsp_id = NEW.tus_plan_id;

  IF v_plan_phase IS NOT NULL THEN
    NEW.tus_plan_phase := v_plan_phase;
  END IF;

  IF NEW.tus_package_kind IS NULL THEN
    NEW.tus_package_kind := public.determine_subscription_package_kind(NEW.tus_user_id, NEW.tus_plan_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_subscription_package_kind ON public.tbl_user_subscriptions;
CREATE TRIGGER trg_set_subscription_package_kind
BEFORE INSERT OR UPDATE OF tus_status, tus_plan_id, tus_user_id
ON public.tbl_user_subscriptions
FOR EACH ROW
EXECUTE FUNCTION public.set_subscription_package_kind();

DROP INDEX IF EXISTS public.idx_unique_active_same_plan_package;
DROP INDEX IF EXISTS public.idx_unique_active_same_phase_amount_package;

CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_earning_same_plan_package
  ON public.tbl_user_subscriptions (tus_user_id, tus_plan_id, tus_status)
  WHERE tus_status IN ('active', 'upgraded')
    AND COALESCE(tus_package_kind, 'registration') IN ('registration', 'renew');

CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_upgrade_same_plan_package
  ON public.tbl_user_subscriptions (tus_user_id, tus_plan_id, tus_status)
  WHERE tus_status IN ('active', 'upgraded')
    AND tus_package_kind = 'upgrade';

CREATE OR REPLACE FUNCTION public.get_user_active_earning_subscription(p_user_id uuid)
RETURNS TABLE (
  subscription_id uuid,
  plan_amount numeric,
  non_working_paid numeric,
  working_paid numeric,
  non_working_remaining numeric,
  working_remaining numeric,
  day_number integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH candidates AS (
    SELECT
      us.tus_id,
      public.get_subscription_plan_amount(us.tus_id) AS package_amount,
      public.get_subscription_non_working_paid(us.tus_id) AS package_non_working_paid,
      public.get_subscription_working_paid(us.tus_id) AS package_working_paid,
      GREATEST(
        1,
        LEAST(
          200,
          ((CURRENT_DATE - COALESCE(us.tus_start_date::date, CURRENT_DATE)) + 1)::integer
        )
      ) AS package_day_number,
      us.tus_start_date
    FROM public.tbl_user_subscriptions us
    JOIN public.tbl_subscription_plans sp ON sp.tsp_id = us.tus_plan_id
    WHERE us.tus_user_id = p_user_id
      AND us.tus_status IN ('active', 'upgraded')
      AND us.tus_exhausted_at IS NULL
      AND (us.tus_end_date IS NULL OR us.tus_end_date > now())
      AND COALESCE(us.tus_plan_phase, sp.tsp_plan_phase, 'prelaunch') = 'launch'
      AND COALESCE(us.tus_package_kind, 'registration') IN ('registration', 'renew')
      AND ((CURRENT_DATE - COALESCE(us.tus_start_date::date, CURRENT_DATE)) + 1) <= 200
  )
  SELECT
    c.tus_id AS subscription_id,
    c.package_amount AS plan_amount,
    c.package_non_working_paid AS non_working_paid,
    c.package_working_paid AS working_paid,
    GREATEST(0, (c.package_amount * 2) - c.package_non_working_paid) AS non_working_remaining,
    GREATEST(0, (c.package_amount * 5) - c.package_working_paid) AS working_remaining,
    c.package_day_number AS day_number
  FROM candidates c
  WHERE c.package_amount > 0
    AND c.package_non_working_paid < (c.package_amount * 2)
    AND c.package_working_paid < (c.package_amount * 5)
  ORDER BY c.tus_start_date ASC NULLS LAST, c.package_amount DESC
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.user_has_active_same_plan_package(
  p_user_id uuid,
  p_plan_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tbl_user_subscriptions us
    WHERE us.tus_user_id = p_user_id
      AND us.tus_plan_id = p_plan_id
      AND us.tus_status IN ('active', 'upgraded')
      AND us.tus_exhausted_at IS NULL
      AND (us.tus_end_date IS NULL OR us.tus_end_date > now())
  );
$$;

REVOKE EXECUTE ON FUNCTION public.user_has_active_same_plan_package(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_has_active_same_plan_package(uuid, uuid) TO authenticated, service_role;

DO $patch_create_registration_payment$
DECLARE
  v_function_definition text;
BEGIN
  SELECT pg_get_functiondef('public.create_registration_payment(uuid, uuid, numeric, text, text, text, text, jsonb)'::regprocedure)
  INTO v_function_definition;

  IF v_function_definition IS NOT NULL
     AND position('user_has_active_same_plan_package(p_user_id, p_plan_id)' IN v_function_definition) = 0 THEN
    v_function_definition := replace(
      v_function_definition,
      '  SELECT tus_id
    INTO v_subscription_id
  FROM public.tbl_user_subscriptions
  WHERE tus_user_id = p_user_id
    AND tus_plan_id = p_plan_id
    AND tus_status = ''active''
  LIMIT 1;

  v_start_date := now();',
      '  IF public.user_has_active_same_plan_package(p_user_id, p_plan_id) THEN
    RAISE EXCEPTION ''You already have an active package for this plan. Renew this plan after the current earning package is exhausted.'';
  END IF;

  v_start_date := now();'
    );

    v_function_definition := replace(
      v_function_definition,
      '  IF v_subscription_id IS NULL THEN
    INSERT INTO public.tbl_user_subscriptions',
      '  IF v_subscription_id IS NULL THEN
    INSERT INTO public.tbl_user_subscriptions'
    );

    EXECUTE v_function_definition;
  END IF;
END;
$patch_create_registration_payment$;

DO $patch_joining_commission_eligibility$
DECLARE
  v_function_definition text;
BEGIN
  SELECT pg_get_functiondef('public.award_launch_joining_commissions_for_payment(uuid)'::regprocedure)
  INTO v_function_definition;

  IF v_function_definition IS NOT NULL
     AND position('upgrade_package_no_direct_income' IN v_function_definition) = 0 THEN
    v_function_definition := replace(
      v_function_definition,
      '  IF v_payment.plan_phase <> ''launch'' THEN
    RETURN jsonb_build_object(''success'', false, ''reason'', ''not_launch_plan'');
  END IF;

  v_joined_user_id := v_payment.tp_user_id;',
      '  IF v_payment.plan_phase <> ''launch'' THEN
    RETURN jsonb_build_object(''success'', false, ''reason'', ''not_launch_plan'');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.tbl_user_subscriptions eligible_subscription
    WHERE eligible_subscription.tus_id = v_payment.tp_subscription_id
      AND COALESCE(eligible_subscription.tus_package_kind, ''registration'') IN (''registration'', ''renew'')
  ) THEN
    RETURN jsonb_build_object(''success'', false, ''reason'', ''upgrade_package_no_direct_income'');
  END IF;

  v_joined_user_id := v_payment.tp_user_id;'
    );

    EXECUTE v_function_definition;
  END IF;
END;
$patch_joining_commission_eligibility$;
