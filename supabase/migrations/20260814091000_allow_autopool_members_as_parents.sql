-- An active AutoPool member may sponsor a new customer, including customers
-- who later purchase a Launch package. Verification checks remain unchanged;
-- an active AutoPool subscription fulfils the parent registration requirement.

CREATE OR REPLACE FUNCTION public.is_user_launch_eligible(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    CASE
      WHEN NOT public.is_launch_phase_active() THEN true
      WHEN public.get_user_active_plan_phase(p_user_id) = 'launch' THEN true
      ELSE EXISTS (
        SELECT 1
        FROM public.tbl_user_subscriptions us
        JOIN public.tbl_subscription_plans sp ON sp.tsp_id = us.tus_plan_id
        WHERE us.tus_user_id = p_user_id
          AND sp.tsp_product_code = 'autopool_20'
          AND us.tus_status IN ('active', 'upgraded')
          AND us.tus_exhausted_at IS NULL
          AND (us.tus_end_date IS NULL OR us.tus_end_date > now())
      )
    END;
$$;

GRANT EXECUTE ON FUNCTION public.is_user_launch_eligible(uuid) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.is_user_launch_eligible(uuid) IS
  'An active Launch-plan or AutoPool member may be used as a parent account during registration.';

-- The registration screen and register_customer both use the sponsor's
-- registration-paid flag.  For sponsorship eligibility, a completed active
-- AutoPool purchase is equivalent to that prerequisite.  This does not modify
-- tu_registration_paid itself or any unrelated registration logic.
DO $parent$
DECLARE
  v_definition text;
  v_paid_expression text := $paid$
    (
      COALESCE(u.tu_registration_paid, false)
      OR EXISTS (
        SELECT 1
        FROM public.tbl_user_subscriptions sponsor_subscription
        JOIN public.tbl_subscription_plans sponsor_plan ON sponsor_plan.tsp_id = sponsor_subscription.tus_plan_id
        WHERE sponsor_subscription.tus_user_id = u.tu_id
          AND sponsor_plan.tsp_product_code = 'autopool_20'
          AND sponsor_subscription.tus_status IN ('active', 'upgraded')
          AND sponsor_subscription.tus_exhausted_at IS NULL
          AND (sponsor_subscription.tus_end_date IS NULL OR sponsor_subscription.tus_end_date > now())
      )
    )
  $paid$;
BEGIN
  SELECT pg_get_functiondef('public.get_sponsor_status_by_sponsorship_number(text)'::regprocedure)
  INTO v_definition;
  v_definition := replace(
    v_definition,
    'COALESCE(u.tu_registration_paid, false) AS is_registration_paid,',
    v_paid_expression || ' AS is_registration_paid,'
  );
  EXECUTE v_definition;

  SELECT pg_get_functiondef('public.register_customer(uuid, text, text, text, text, text, text, text)'::regprocedure)
  INTO v_definition;
  v_definition := replace(
    v_definition,
    'COALESCE(u.tu_registration_paid, false) AS is_registration_paid,',
    v_paid_expression || ' AS is_registration_paid,'
  );
  EXECUTE v_definition;

  SELECT pg_get_functiondef('public.get_sponsor_by_sponsorship_number(text)'::regprocedure)
  INTO v_definition;
  v_definition := replace(
    v_definition,
    'AND COALESCE(u.tu_registration_paid, false) = true',
    'AND ' || v_paid_expression
  );
  EXECUTE v_definition;
END;
$parent$;

GRANT EXECUTE ON FUNCTION public.get_sponsor_status_by_sponsorship_number(text) TO anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.get_sponsor_by_sponsorship_number(text) TO anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.register_customer(uuid, text, text, text, text, text, text, text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
