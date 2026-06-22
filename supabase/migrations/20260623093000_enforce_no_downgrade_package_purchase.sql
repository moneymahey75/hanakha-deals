-- Enforce no-downgrade package purchases for active earning packages.
-- A user with an active higher package cannot buy a lower package until the
-- higher package is exhausted by 5x income or the 200-day window.

CREATE OR REPLACE FUNCTION public.user_has_higher_active_earning_package(
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
    SELECT round(COALESCE(sp.tsp_price, 0)::numeric, 6) AS plan_amount
    FROM public.tbl_subscription_plans sp
    WHERE sp.tsp_id = p_plan_id
  )
  SELECT EXISTS (
    SELECT 1
    FROM public.tbl_user_subscriptions us
    JOIN public.tbl_subscription_plans sp ON sp.tsp_id = us.tus_plan_id
    CROSS JOIN target_plan target
    WHERE us.tus_user_id = p_user_id
      AND public.is_subscription_earning_active(us.tus_id)
      AND (p_exclude_subscription_id IS NULL OR us.tus_id <> p_exclude_subscription_id)
      AND round(COALESCE(us.tus_payment_amount, sp.tsp_price, 0)::numeric, 6) > target.plan_amount
  );
$$;

CREATE OR REPLACE FUNCTION public.can_purchase_subscription_plan(
  p_user_id uuid,
  p_plan_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan_amount numeric := NULL;
  v_subscription record;
BEGIN
  IF p_user_id IS NULL OR p_plan_id IS NULL THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'invalid_request',
      'message', 'Missing user or plan.'
    );
  END IF;

  SELECT round(COALESCE(tsp_price, 0)::numeric, 6)
  INTO v_plan_amount
  FROM public.tbl_subscription_plans
  WHERE tsp_id = p_plan_id
    AND COALESCE(tsp_is_active, true) = true;

  IF v_plan_amount IS NULL OR v_plan_amount <= 0 THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'invalid_plan',
      'message', 'Selected plan is not available.'
    );
  END IF;

  FOR v_subscription IN
    SELECT tus_id
    FROM public.tbl_user_subscriptions
    WHERE tus_user_id = p_user_id
      AND tus_status IN ('active', 'upgraded')
      AND tus_exhausted_at IS NULL
  LOOP
    PERFORM public.mark_subscription_exhausted_if_needed(v_subscription.tus_id);
  END LOOP;

  IF public.user_has_active_same_plan_package(p_user_id, p_plan_id, NULL) THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'same_active_package',
      'message', 'You already have an active package for this plan. Renew this plan after the current package is exhausted.'
    );
  END IF;

  IF public.user_has_higher_active_earning_package(p_user_id, p_plan_id, NULL) THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'higher_active_package',
      'message', 'You cannot buy a lower package while a higher package is still active. Buy the same or higher package only after the higher package is exhausted.'
    );
  END IF;

  RETURN jsonb_build_object(
    'allowed', true,
    'reason', 'allowed',
    'message', 'Plan purchase is allowed.'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_active_plan_purchase_hierarchy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_subscription record;
BEGIN
  IF NEW.tus_status NOT IN ('active', 'upgraded') OR NEW.tus_exhausted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  FOR v_subscription IN
    SELECT tus_id
    FROM public.tbl_user_subscriptions
    WHERE tus_user_id = NEW.tus_user_id
      AND tus_id <> NEW.tus_id
      AND tus_status IN ('active', 'upgraded')
      AND tus_exhausted_at IS NULL
  LOOP
    PERFORM public.mark_subscription_exhausted_if_needed(v_subscription.tus_id);
  END LOOP;

  IF public.user_has_active_same_plan_package(NEW.tus_user_id, NEW.tus_plan_id, NEW.tus_id) THEN
    RAISE EXCEPTION 'You already have an active package for this plan. Renew this plan after the current package is exhausted.';
  END IF;

  IF public.user_has_higher_active_earning_package(NEW.tus_user_id, NEW.tus_plan_id, NEW.tus_id) THEN
    RAISE EXCEPTION 'You cannot buy a lower package while a higher package is still active. Buy the same or higher package only after the higher package is exhausted.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_active_plan_purchase_hierarchy ON public.tbl_user_subscriptions;
CREATE TRIGGER trg_enforce_active_plan_purchase_hierarchy
BEFORE INSERT OR UPDATE OF tus_user_id, tus_plan_id, tus_status, tus_exhausted_at, tus_payment_amount, tus_plan_phase
ON public.tbl_user_subscriptions
FOR EACH ROW
EXECUTE FUNCTION public.enforce_active_plan_purchase_hierarchy();

REVOKE EXECUTE ON FUNCTION public.user_has_higher_active_earning_package(uuid, uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_purchase_subscription_plan(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enforce_active_plan_purchase_hierarchy() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.user_has_higher_active_earning_package(uuid, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_purchase_subscription_plan(uuid, uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
