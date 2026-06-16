-- Enforce package repurchase rules.
-- A user cannot hold two active packages for the same launch plan value/plan.
-- Once a package is exhausted, renewal must create a new subscription row.

ALTER TABLE public.tbl_user_subscriptions
  DROP CONSTRAINT IF EXISTS tbl_user_subscriptions_tus_status_check;

ALTER TABLE public.tbl_user_subscriptions
  ADD CONSTRAINT tbl_user_subscriptions_tus_status_check
  CHECK (tus_status IN ('active', 'expired', 'cancelled', 'upgraded', 'exhausted'));

ALTER TABLE public.tbl_user_subscriptions
  ADD COLUMN IF NOT EXISTS tus_exhausted_at timestamptz,
  ADD COLUMN IF NOT EXISTS tus_exhaustion_reason text;

CREATE INDEX IF NOT EXISTS idx_user_subscriptions_active_plan_guard
  ON public.tbl_user_subscriptions (tus_user_id, tus_plan_id, tus_status)
  WHERE tus_status IN ('active', 'upgraded');

CREATE INDEX IF NOT EXISTS idx_user_subscriptions_active_launch_price_guard
  ON public.tbl_user_subscriptions (tus_user_id, tus_plan_phase, tus_status, tus_payment_amount)
  WHERE tus_status IN ('active', 'upgraded');

CREATE OR REPLACE FUNCTION public.user_has_active_same_plan_package(
  p_user_id uuid,
  p_plan_id uuid,
  p_exclude_subscription_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH target_plan AS (
    SELECT
      sp.tsp_id,
      round(COALESCE(sp.tsp_price, 0)::numeric, 6) AS plan_amount,
      COALESCE(sp.tsp_plan_phase, 'prelaunch') AS plan_phase
    FROM public.tbl_subscription_plans sp
    WHERE sp.tsp_id = p_plan_id
  )
  SELECT EXISTS (
    SELECT 1
    FROM public.tbl_user_subscriptions us
    JOIN public.tbl_subscription_plans sp ON sp.tsp_id = us.tus_plan_id
    CROSS JOIN target_plan target
    WHERE us.tus_user_id = p_user_id
      AND us.tus_status IN ('active', 'upgraded')
      AND us.tus_exhausted_at IS NULL
      AND (p_exclude_subscription_id IS NULL OR us.tus_id <> p_exclude_subscription_id)
      AND (
        us.tus_plan_id = target.tsp_id
        OR (
          COALESCE(us.tus_plan_phase, sp.tsp_plan_phase, 'prelaunch') = target.plan_phase
          AND round(COALESCE(us.tus_payment_amount, sp.tsp_price, 0)::numeric, 6) = target.plan_amount
        )
      )
  );
$$;

REVOKE EXECUTE ON FUNCTION public.user_has_active_same_plan_package(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_has_active_same_plan_package(uuid, uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.enforce_one_active_same_plan_package()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.tus_status NOT IN ('active', 'upgraded') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.tus_status = 'exhausted'
     AND NEW.tus_status IN ('active', 'upgraded') THEN
    RAISE EXCEPTION 'Exhausted packages cannot be reactivated. Purchase must create a new package.';
  END IF;

  IF public.user_has_active_same_plan_package(NEW.tus_user_id, NEW.tus_plan_id, NEW.tus_id) THEN
    RAISE EXCEPTION 'You already have an active package for this plan. Renew this plan after the current package is exhausted.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_one_active_same_plan_package ON public.tbl_user_subscriptions;

CREATE TRIGGER trg_enforce_one_active_same_plan_package
BEFORE INSERT OR UPDATE OF tus_user_id, tus_plan_id, tus_status, tus_payment_amount, tus_plan_phase, tus_exhausted_at
ON public.tbl_user_subscriptions
FOR EACH ROW
EXECUTE FUNCTION public.enforce_one_active_same_plan_package();

REVOKE EXECUTE ON FUNCTION public.enforce_one_active_same_plan_package() FROM PUBLIC;

-- Patch reserved-payment RPCs so they fail clearly instead of silently deduping
-- to an existing active package.
DO $$
DECLARE
  v_function_definition text;
BEGIN
  SELECT pg_get_functiondef('public.create_subscription_payment_from_reserved(uuid, uuid, text, jsonb)'::regprocedure)
  INTO v_function_definition;

  IF v_function_definition IS NOT NULL
     AND position('user_has_active_same_plan_package(p_user_id, p_plan_id)' IN v_function_definition) = 0 THEN
    v_function_definition := replace(
      v_function_definition,
      '  v_plan_price := round(v_plan_price, 6);',
      '  v_plan_price := round(v_plan_price, 6);

  IF public.user_has_active_same_plan_package(p_user_id, p_plan_id) THEN
    RAISE EXCEPTION ''You already have an active package for this plan. Renew this plan after the current package is exhausted.'';
  END IF;'
    );

    v_function_definition := replace(
      v_function_definition,
      '  SELECT tus_id
    INTO v_subscription_id
  FROM public.tbl_user_subscriptions
  WHERE tus_user_id = p_user_id
    AND tus_plan_id = p_plan_id
    AND tus_status = ''active''
  LIMIT 1;

  IF v_subscription_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      ''success'', true,
      ''payment_id'', null,
      ''subscription_id'', v_subscription_id,
      ''plan_phase'', v_plan_phase,
      ''deduped'', true
    );
  END IF;

',
      ''
    );

    EXECUTE v_function_definition;
  END IF;

  SELECT pg_get_functiondef('public.create_upgrade_payment_with_reserved_and_chain(uuid, uuid, numeric, numeric, text, text, jsonb)'::regprocedure)
  INTO v_function_definition;

  IF v_function_definition IS NOT NULL
     AND position('user_has_active_same_plan_package(p_user_id, p_plan_id)' IN v_function_definition) = 0 THEN
    v_function_definition := replace(
      v_function_definition,
      '  v_plan_price := round(v_plan_price, 6);',
      '  v_plan_price := round(v_plan_price, 6);

  IF public.user_has_active_same_plan_package(p_user_id, p_plan_id) THEN
    RAISE EXCEPTION ''You already have an active package for this plan. Renew this plan after the current package is exhausted.'';
  END IF;'
    );

    v_function_definition := replace(
      v_function_definition,
      '  SELECT tus_id
    INTO v_subscription_id
  FROM public.tbl_user_subscriptions
  WHERE tus_user_id = p_user_id
    AND tus_plan_id = p_plan_id
    AND tus_status = ''active''
  LIMIT 1;

  IF v_subscription_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      ''success'', true,
      ''payment_id'', null,
      ''subscription_id'', v_subscription_id,
      ''plan_phase'', v_plan_phase,
      ''deduped'', true
    );
  END IF;

',
      ''
    );

    EXECUTE v_function_definition;
  END IF;
END;
$$;

